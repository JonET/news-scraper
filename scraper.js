var cheerio = require('cheerio');
var request = require('request');
var fs      = require('fs');
var url     = require('url');
var moment  = require('moment');
var _       = require('lodash');

if(!fs.existsSync('articles')) {
  fs.mkdirSync('articles');
}

request('http://edition.cnn.com/', function(err, res, body) {
  if(!err && res.statusCode === 200) {
    articleUrls = scrapeIndex(body);
    var i = 0;
    var next = function() {
      i++;
      if(articleUrls.length > i) {
        request(articleUrls[i], function(err, res, body) {
          scrapeArticle(articleUrls[i], body);
          next();
        })
      }
    }
    next();
  }
  else {
    console.log("Error Fetching CNN", err);
  }
});



var resolve = function(urlFrag) {
  return url.resolve('http://edition.cnn.com/',urlFrag);
}

var scrapeIndex = function(body) {
  console.log("Body Received");
  var $ = cheerio.load(body);
  var $articleLinks = $('a').filter(function(i,e) {
    var href = $(e).attr('href');
    if(href) {
      return resolve(href).match(/^http:\/\/edition.cnn.com\/201/);
    }
  });

  var articleUrls = $articleLinks.map(function(i,link) {
    var parsed = url.parse(resolve($(link).attr('href')), true);
    // remove up parts of the URL we don't care about.
    delete parsed.query;
    delete parsed.search;
    delete parsed.hash;

    return url.format(parsed);
  });

  articleUrls = _.uniq(articleUrls);

  return articleUrls;
}

var scrapeArticle = function(url, body) {
  var $ = cheerio.load(body);

  var article = {};
  console.log('scraping', url);
  article.id = url;

  article.headline = $('#cnnContentContainer h1').first().text();
  var paragraphs = $('#cnnContentContainer p').clone().removeAttr('class');

  article.text = _.map(paragraphs, function(p) {
    return $(p).text();
  }).join('\n\n');

  var fileName = url.replace(/([^a-z0-9]+)/gi,'-') + '.json';
  byLine = $('.cnnByline strong').text();
  article.authorName = byLine.substring(0, byLine.length - 1);
  var timestamp = $('.cnn_strytmstmp').text();

  var timestampParts = timestamp.split(' -- ');
  var date = moment.utc(timestampParts[0]);

  if(timestampParts.length >=1 && timestampParts[1]) {
    var time = timestampParts[1].match(/(\d{2})(\d{2}) GMT/);
    date.hours(parseInt(time[1]));
    date.minute(parseInt(time[2]));
  }
  article.timestamp = date.toISOString();


  var data = JSON.stringify(article, null, 2);
  fs.writeFileSync("articles/" + fileName, data);

}

