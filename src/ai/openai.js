const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const OPENAI_APIKEY = process.env.OPENAI_APIKEY;

// Initialize OpenAI client with proper error handling
const openai = OPENAI_APIKEY ? new OpenAI({
  apiKey: OPENAI_APIKEY,
}) : null;

async function completions({
  model = "gpt-4o-mini",
  messages,
  temperature = 0.7
}) {
    if (!openai) {
        throw new Error('OpenAI client not initialized. Please set OPENAI_APIKEY environment variable.');
    }
    
    console.log(model);
    console.log(temperature);
    console.log(messages);
    
    try {
        const completion = await openai.chat.completions.create({
            model,
            messages,
            temperature
        });
        
        console.log(JSON.stringify(completion));
        return completion;
    } catch (error) {
        console.error(`❌ ERROR: ${error.code || error.type}`);
        console.error(error.message);
        throw error;
    }
}

/**
 * Transcribes an audio buffer using OpenAI Whisper API.
 * @param {Buffer} audioBuffer - The audio data buffer.
 * @param {string} filename - The name of the audio file (with extension, e.g., 'audio.mp3').
 * @param {string} apiKey - Your OpenAI API key (optional, uses environment variable by default).
 * @returns {Promise<Object>} - Object containing QNA array, raw text, and OpenAI response data.
 */
async function transcribeAudio(audio, filename, apiKey = OPENAI_APIKEY) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Please set OPENAI_APIKEY environment variable.');
  }
  
  try {
    // Convert buffer to readable stream for OpenAI SDK
    const audioStream = Readable.from(audio);
    // Add filename property for proper handling
    audioStream.path = filename;

    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      // Optional parameters can be uncommented as needed:
      // prompt: 'This is an interview between two people. One asks questions, the other answers. Do not hallucinate.',
      // response_format: 'verbose_json',
    });

    const text = transcription.text;
    console.log('OpenAI Response for Transcription: ', transcription);

    // Simple Q&A extraction
    const qna = [];
    const lines = text.split(/\r?\n/);
    let currentQuestion = null;

    for (const line of lines) {
      if (/^Q[:：]/i.test(line)) {
        currentQuestion = line.replace(/^Q[:：]\s*/i, '').trim();
      } else if (/^A[:：]/i.test(line) && currentQuestion) {
        const answer = line.replace(/^A[:：]\s*/i, '').trim();
        qna.push({ question: currentQuestion, answer });
        currentQuestion = null;
      }
    }

    return { qna, rawText: text, openAiResponseData: transcription };
  } catch (error) {
    console.error('Transcription failed:', error.message);
    throw new Error('Transcription error');
  }
}

/**
 * Helper function to determine MIME type based on file extension.
 * @param {string} filename - The filename with extension.
 * @returns {string} - The MIME type.
 */
function getAudioMimeType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'm4a': 'audio/m4a',
    'webm': 'audio/webm'
  };
  return mimeTypes[ext] || 'audio/mpeg';
}

/**
 * Converts Q&A into a structured article structure using OpenAI completions.
 * @param {Object} transcription - Transcription object from transcribeAudio.
 * @param {string} apiKey - OpenAI API key (optional, uses environment variable by default).
 * @returns {Promise<Object>} - Object containing structured article data.
 */
async function generateInterviewStructure(transcription, apiKey = OPENAI_APIKEY) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Please set OPENAI_APIKEY environment variable.');
  }
  
  const systemPrompt = `
You are a journalist formatting an interview for publication. Use always the whole text as reference.
You are given a transcription of an interview in raw text. 
Desume the interview structure, without allucinating. Create a JSON response with the following structure:
{
  "structure": {
    "headline": "",
    "summary": "",
    "html": ""
  },
  "metadata": {
    "seoTitle": "",
    "seoMeta": "",
    "keywords": ""
  }
}

Where:
headline: A concise, engaging headline. The title should capture the essence of the article and be suitable for a news audience. The generated title must not exceed 50 characters in length. Don't put a full stop at the end of the title.
summary: A short summary paragraph (3-4 sentences).should capture the essence of the article and be suitable for a news audience. The generated summary must not exceed 150 characters in length. Don't put a full stop at the end of the summary.
html: The full transcription body in HTML. Usually all parts of text should use paragraphs <p> but use <h3> for questions and <p> for answers. Use the whole Transcription for it. All html tags need an id attribute with 13 characters, starting with "U", the rest will be lowercase letters, uppercase letters, and numbers only.
seoTitle: A creative, engaging, and relevant SEO title based on the article provided. The title should capture the essence of the article and be suitable for a news audience. The generated title must not exceed 50 characters in length. Don't put a full stop at the end of the title.
seoMeta: A creative, engaging, and relevant SEO Meta Description based on the article provided. The Meta Description should capture the essence of the article and be suitable for a news audience. The generated Meta Description must not exceed 150 characters in length. Don't put a full stop at the end of the Meta Description.
keywords: I would like you to act as a keywords extraction server. I give you a text and you respond with the keywords extracted from the text. Give a maximum of five keyswords per prompt. You only answer with the list of keywords and nothing else. The words must exist. Precise presentation of the top information. Focus on the core statements of the article. Favour clear and concrete information. Do not write any explanations. 

Use the whole text to generate the HTML part. Do not skip any text while creating the HTML structure. Do not hallucinate on the content.
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Text: ${transcription.rawText}` }
      ],
      temperature: 0.7
    });

    const content = completion.choices[0].message.content;
    const jsonContent = JSON.parse(content);
    console.log('OpenAi Completions: ', jsonContent);
    
    return jsonContent;

  } catch (error) {
    console.error('Completion failed:', error.message);
    throw new Error('Summary generation error');
  }
}


async function test() {
  try {
    const response = await completions({ 
      "messages": [{"role": "user", "content": "Say this is a test!"}] 
    });
    return response;
  } catch (error) {
    console.error('Test function failed:', error.message);
    throw error;
  }
}

module.exports = {
  completions,
  transcribeAudio,
  generateInterviewStructure,
  test
}