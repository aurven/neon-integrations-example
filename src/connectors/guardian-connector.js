const fs = require('fs');
const axios = require('axios');
const { parse } = require('node-html-parser');
const dayjs = require('dayjs');

// Replace with your own API key obtained from The Guardian https://open-platform.theguardian.com/documentation/
const apiKey = process.env.GUARDIAN_APIKEY;
const baseUrl = 'https://content.guardianapis.com/search';

async function downloadImage(url, image_path) {
    return axios({
        url,
        responseType: 'stream',
    }).then(
        response =>
            new Promise((resolve, reject) => {
                response.data
                    .pipe(fs.createWriteStream(image_path))
                    .on('finish', () => {
                        console.log(`✅ Image downloaded in ${image_path}!`);
                        resolve();
                    })
                    .on('error', e => {
                        console.log(`❌ Error while downloading ${url}!`);
                        reject(e);
                    });
            }),
    );
}

async function getItemsFromSite(options, saveLocally = false) {
    const pageSize = options.pageSize || '10';
    const section = options.section || 'technology';
    const fromDate = options.fromDate || dayjs().subtract(1, 'month').format('YYYY-MM-DD');
    const toDate = options.toDate || dayjs().format('YYYY-MM-DD');
    const showFields = options.showFields || 'all';
  
    const importDate = dayjs().format('YYYYMMDD');
    const importPath = `./imports/guardian/${importDate}`;
    const jsonFileName = `guardian_${section}_${fromDate}_${toDate}.json`;
  

    console.log(`⏬ Getting ${pageSize} items from "${section}" section from ${fromDate} to ${toDate}...`);
    console.log(`🎯 Target: ${importPath}/${jsonFileName}`);

    if (saveLocally) {
      try {
          if (!fs.existsSync(importPath)) {
              fs.mkdirSync(importPath + '/assets', { recursive: true });
          }
      } catch (err) {
          console.error('❌', err);
      }
    }

    // Build the API request URL
    const url = `${baseUrl}?api-key=${apiKey}&page-size=${pageSize}&section=${section}&from-date=${fromDate}&to-date=${toDate}&show-fields=${showFields}`;

    const items = [];

    // Send API request
    console.log(`🤙 Calling ${url}`);
    await axios.get(url)
        .then(response => {
            if (response.status === 200) {
                const data = response.data;
                const results = data.response.results;
                const articles = results.filter(item => item.type === 'article');
                const liveblogs = results.filter(item => item.type === 'liveblog');
                const others = results.filter(item => (
                    item.type === 'article' && item.type === 'liveblog'
                ));

                // Loop through each article in the response
                articles
                    .forEach(article => {
                        const idArray = article.id.split('/');
                        const idString = idArray[idArray.length - 1];

                        const figureRoot = parse(article.fields.main);
                        const figureUrl = figureRoot.querySelector('figure img')?.getAttribute?.('src');
                        const figureCaption = figureRoot.querySelector('figcaption .element-image__caption')?.textContent || null;
                        const figureCredit = figureRoot.querySelector('figcaption .element-image__credit')?.textContent || null;
                        const localFigurePath = `${importPath}/assets/${idString}.jpg`;

                        items.push({
                            id: idString,
                            itemUrl: article.webUrl,
                            overhead: article.sectionName,
                            headline: article.fields.headline,
                            summary: article.fields.trailText,
                            byline: article.fields.byline,
                            figureURL: figureUrl,
                            localFigurePath: localFigurePath,
                            figureCaption: figureCaption,
                            figureCredit: figureCredit,
                            mainContent: article.fields.bodyText,
                            mainContentHtml: article.fields.body
                        });

                        console.log(`✅ Got item ${idString} (${article.webUrl})`)
                    });
            } else {
                console.log(`❌ Error: ${response.status}`);
            }


        })
        .catch(error => {
            console.log(`❌ Error: ${error}`);
        })
        .finally(() => {
            const jsonContent = JSON.stringify(items);
        
            if (saveLocally) {
              const tmpFilePath = 'tmp/scrapedItems.json';
              const filePath = `${importPath}/${jsonFileName}`;
              try {
                  fs.writeFileSync(tmpFilePath, jsonContent);
                  fs.writeFileSync(filePath, jsonContent);
                  console.log('💾 JSON data saved!');
              } catch (error) {
                  console.log('❌ Error', error);
              }

              console.log('🖼️ Downloading images...')

              items.reduce((acc, item) => {
                  const imgUrl = item.figureURL;
                  const localPath = item.localFigurePath;
                  console.log(`⏬ Downloading image from ${imgUrl}`);

                  if (imgUrl) {
                      return acc.then(async () => {
                          return await downloadImage(imgUrl, localPath);
                      });
                  }
                  return acc;

              }, Promise.resolve());
            }
        });
  
    return items;
}

module.exports = {
  getItems: getItemsFromSite,
};
