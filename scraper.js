'use strict';

var cheerio = require('cheerio');
var request = require('request');
var fs      = require('fs');
var url     = require('url');
var moment  = require('moment');
var _       = require('lodash');

if(!fs.existsSync('articles')) {
  fs.mkdirSync('articles');
}

const concurrency = 10;

let scrapedArticles = [];
let articleUrls = [];

var resolve = function(urlFrag) {
  return url.resolve('http://edition.cnn.com/',urlFrag);
};

request('http://edition.cnn.com/', function(err, res, body) {
  let tasks = 0;
  if(!err && res.statusCode === 200) {
    let $ = cheerio.load(body);

    articleUrls = scrapeUrls(body);

    let footerLinks = $('.m-footer__link');
    footerLinks.each((i, link) => {
      if(link) {
        console.log(`adding footer link`, resolve(link.attribs.href));
        articleUrls.push(resolve(link.attribs.href));
      }
    });



    var i = 0;
    var next = function() {
      console.log(`scraped ${scrapedArticles.length} of ${articleUrls.length}`);
      i++;
      if(articleUrls.length > i) {
        if(scrapedArticles.indexOf(articleUrls[i]) !== -1) {
          next();
          return;
        }
        scrapedArticles.push(articleUrls[i]);
        request(articleUrls[i], function(err, res, body) {
          scrapeArticle(articleUrls[i], body);
          next();
        })
      }
    };

    for(var i = 0; i < concurrency; ++i) {
      next();
    }

  }
  else {
    console.log("Error Fetching CNN", err);
  }
});





var scrapeUrls = function(body) {
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
};

var scrapeArticle = function(url, body) {
  if(!url || !body) {
    console.log('empty article or url');
    return;
  }
  var $ = cheerio.load(body);

  let urls = scrapeUrls(body);
  urls.forEach(url => {
    if(articleUrls.indexOf(url) === -1) {
      articleUrls.push(url);
    }
  });

  var article = {};
  console.log('scraping', url);
  article.id = url;

  article.headline = $('.pg-headline').text();
  var paragraphs = $('.zn-body__paragraph').clone().removeAttr('class');

  article.text = _.map(paragraphs, function(p) {
    return $(p).text();
  }).join('\n\n');


  if(article.text.trim() === '') {
    console.log('empty article. ignoring');
    return;
  }

  var fileName = url.replace(/([^a-z0-9]+)/gi,'-') + '.json';
  let byLine = $('.metadata__byline__author').text();
  // article.authorName = byLine.substring(0, byLine.length - 1);
  article.authorName = byLine;
  var timestamp = $('.update-time').text();

  var timestampParts = timestamp.match(/(\d{4}) GMT.*\) (.*)$/);
  if(timestampParts && timestampParts.length == 2) {
    var date = moment.utc(timestampParts[2]);
    date.hours = +timestampParts[1];

    article.timestamp = date.toISOString();
  } else {
    article.timestamp = moment().toISOString();
  }

  article.url = url;
  article.scrapeTime = moment().toISOString();
  article.originalBody = body;

  var data = JSON.stringify(article, null, 2);
  console.log('writing article', fileName);
  fs.writeFileSync("articles/" + fileName, data);

};

