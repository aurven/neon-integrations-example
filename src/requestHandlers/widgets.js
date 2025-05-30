const mammoth = require("mammoth");
const seo = require("../seo.json");
const openai = require("../ai/openai.js");
const storiesPopulator = require("../stories-populator.js");

function testWidgetHandler(request, reply) {
  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/widgets/test.hbs", params);
}

function dropWidgetHandler (request, reply) {
  // params is an object we'll pass to our handlebars template
  let params = { seo: seo, neonAppUrl: process.env.NEON_APP_URL };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/widgets/drop-a-doc.hbs", params);
}

async function asyncDropUploadWidgetHandler(request, reply) {
  const supportedDocs = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  const supportedAudios = [
    'audio/mpeg',
    'audio/ogg'
  ];
  
  // params is an object we'll pass to our handlebars template
  let params = { seo: seo };
  
  const data = await request.file({
      limits: {
        fileSize: 10 * 1024 * 1024,  // 10mb limit
      }
    });
  
  //await data.toBuffer();
  
  const isDocument = data && data.mimetype && supportedDocs.includes(data.mimetype);
  const isAudio = data && data.mimetype && supportedAudios.includes(data.mimetype);
  
  async function stream2buffer(stream) {

      return new Promise((resolve, reject) => {

          const _buf = [];

          stream.on("data", (chunk) => _buf.push(chunk));
          stream.on("end", () => resolve(Buffer.concat(_buf)));
          stream.on("error", (err) => reject(err));

      });
    }

  const dataBuffer = await stream2buffer(data.file);
  const fileName = data.filename;
  
  if (isDocument) {
    const parsedDoc = await mammoth.convertToHtml({buffer: dataBuffer})
      .then(function(result){
          const html = result.value; // The generated HTML
          const messages = result.messages; // Any messages, such as warnings during conversion
          return result;
      })
      .catch(function(error) {
          console.error(error);
      });

    const resultMessage = fileName + ' successfully imported!';
    console.log(resultMessage);
    console.log(parsedDoc);

    return reply.status(200).send({
      message: resultMessage,
      document: parsedDoc
    });
  }
  
  if (isAudio) {
    const transcription = await openai.transcribeAudio(dataBuffer, fileName);
    
    const { structure, metadata } = await openai.generateInterviewStructure(transcription);
    
    const neonPopulatorOptions = {
        "site": "TheGlobe",
        "workspace": "/Convergent/Culture",
        "directPublish": false,
        "siteAsChannel": false,
    };
    
    const processResult = await storiesPopulator.populateNeonInstance([
        {
            "id": fileName,
            "itemUrl": null,
            "overhead": "Interview",
            "headline": structure.headline,
            "summary": structure.summary,
            "byline": "by Eidosmedia AI Suite",
            "figureURL": null,
            "localFigurePath": null,
            "figureCaption": null,
            "figureCredit": null,
            "mainContentHtml": structure.html,
            "metadata": metadata
        }
    ], neonPopulatorOptions);
    
    const resultMessage = fileName + ' successfully imported!';

    return reply.status(200).send({
      message: resultMessage,
      transcription: transcription,
      structure: structure,
      neon: processResult
    });
  }
  
  return reply.status(400).send({
    message: 'Unsupported MIME type',
    supportedTypes: {
      documentTypes: supportedDocs,
      audioTypes: supportedAudios
    }
  });
}

function wiresWidgetHandler (request, reply) {
  // params is an object we'll pass to our handlebars template
  let params = { seo: seo, apiKey: process.env.NEON_EXT_APIKEY, neonAppUrl: process.env.NEON_APP_URL };

  // The Handlebars code will be able to access the parameter values and build them into the page
  return reply.view("/src/widgets/wires-list.hbs", params);
}

module.exports = {
  testWidgetHandler,
  dropWidgetHandler,
  asyncDropUploadWidgetHandler,
  wiresWidgetHandler
};