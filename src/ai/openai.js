// const { OpenAIApi } = require('openai'); Not compatible with Node 14

const axios = require('axios');
const FormData = require('form-data');

const OPENAI_APIKEY = process.env.OPENAI_APIKEY;

async function completions({
  model = "gpt-4o-mini",
  messages,
  temperature = 0.7
}) {
    console.log(model);
    console.log(temperature);
    console.log(messages);
    console.log(OPENAI_APIKEY);
    
    const data = JSON.stringify({
      model, messages, temperature
    });

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        url: `https://api.openai.com/v1/chat/completions`,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_APIKEY}`
        },
        data: data
    };

    return await axios.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

/**
 * Transcribes an audio buffer using OpenAI Whisper API.
 * @param {Buffer} audioBuffer - The audio data buffer.
 * @param {string} filename - The name of the audio file (with extension, e.g., 'audio.mp3').
 * @param {string} apiKey - Your OpenAI API key.
 * @returns {Promise<string>} - The transcribed text.
 */
async function transcribeAudio(audio, filename, apiKey = OPENAI_APIKEY) {
  const form = new FormData();
  form.append('file', audio, filename);
  form.append('model', 'whisper-1'); // The options are gpt-4o-transcribe, gpt-4o-mini-transcribe, and whisper-1
  //form.append('prompt', 'This is an interview between two people. One asks questions, the other answers. Do not hallucinate.');
  //form.append('response_format', 'verbose_json');
  
  try {
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${apiKey}`
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const text = response.data.text;
    console.log('OpenAI Response for Transcription: ', response.data);

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

    return { qna, rawText: text, openAiResponseData: response.data };
  } catch (error) {
    console.error('Transcription failed:', error.response?.data || error.message);
    throw new Error('Transcription error');
  }
}

/**
 * Converts Q&A into a structured article structure using OpenAI completions.
 * @param {Object[]} qa - Array of Q&A objects from transcription.
 * @param {string} apiKey
 * @returns {Promise<{ headline: string, summary: string, html: string }>}
 */
async function generateInterviewStructure(transcription, apiKey = OPENAI_APIKEY) {
  const qa = transcription.qna;
  
  const prompt = `
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
Text: ${transcription.rawText}
`;

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a journalist formatting an interview for publication. Use always the whole text as reference.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const content = response.data.choices[0].message.content;
    const jsonContent = JSON.parse(content);
    console.log('OpenAi Completions: ', jsonContent);
    
    return jsonContent;

    // Naive parsing — assuming sections are clearly separated
    /*
    const headlineMatch = content.match(/headline[:\-]?\s*(.+)/i);
    const summaryMatch = content.match(/summary[:\-]?\s*((.|\n)+?)\n\n/i);
    const htmlMatch = content.match(/<h3>.*<\/p>/is);

    return {
      headline: headlineMatch?.[1]?.trim() || '',
      summary: summaryMatch?.[1]?.trim() || '',
      html: htmlMatch?.[0]?.trim() || ''
    };*/
    
    

  } catch (error) {
    console.error('Completion failed:', error.response?.data || error.message);
    throw new Error('Summary generation error');
  }
}


async function test() {
  return await completions({ "messages": [{"role": "user", "content": "Say this is a test!"}] });
}

module.exports = {
  completions,
  transcribeAudio,
  generateInterviewStructure,
  test
}