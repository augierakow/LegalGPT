import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import { Configuration, OpenAIApi } from "openai";
import pkg from '@slack/bolt';

const { App } = pkg;

// Slack Configurations
const signingSecret = process.env.SLACK_SIGNING_SECRET;
const botToken = process.env.SLACK_BOT_TOKEN;

// Initialize Slack Bolt App
const boltApp = new App({
  signingSecret: signingSecret,
  token: botToken
});

// Listen for a message that contains "gpt"
boltApp.message(/gpt (.+)/, async ({ message, say, context }) => {
  const userQuery = context.matches[1]; // Extract text after "gpt"
  const gptResponse = await fetchOpenAIResponse(userQuery); // Pass it to fetchOpenAIResponse
  await say(`Hello, <@${message.user}>, ${gptResponse}`);
});

(async () => {
  await boltApp.start(process.env.PORT || 3002);
  console.log(`⚡️ Bolt app is running!`);
})();

// Initialize Express App
const expressApp = express();
const port = 3003;

// This function fetches a response from OpenAI's GPT-4 model
async function fetchOpenAIResponse(userQuery) {  // Added userQuery as a parameter
  try {
    const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));
    const promptMessage = [
      { role: "user", content: userQuery }  // Replaced "engineering aphorism" with userQuery
    ];
    const response = await openai.createChatCompletion({
      model: "gpt-4",
      messages: promptMessage
    });
    return response.data.choices[0].message.content;  // Return the API response
  } catch (error) {
    console.error("OpenAI API Error:", error);
    return "An error occurred while fetching data from OpenAI";  // Return an error message
  }
}

expressApp.get("/", async (req, res) => {
  console.log('API Key:', process.env.OPENAI_API_KEY);

  try {
    const response = await fetchOpenAIResponse("Test Query");  // Added a test query for the express route
    res.send(response);  // Send the OpenAI API response as the HTTP response
  } catch (error) {
    console.error("Error details:", error);
    res.status(500).send("An error occurred");
  }
});

expressApp.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
