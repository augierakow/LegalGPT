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

// Listen for any message
boltApp.message(async ({ message, say }) => {
  const userQuery = message.text; // Extract the entire message text
  const gptResponse = await fetchOpenAIResponse(userQuery); // Pass it to fetchOpenAIResponse
  await say(`<@${message.user}>, ${gptResponse}`);
});

// Start the Bolt App
(async () => {
  await boltApp.start(process.env.PORT || 3002);
  console.log(`⚡️ Bolt app is running!`);
})();

// Initialize Express App
const expressApp = express();
const port = 3003;

// Function to fetch OpenAI Response
async function fetchOpenAIResponse(userQuery) {
  try {
    const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));
    const promptMessage = [
      { role: "user", content: userQuery }
    ];
    const response = await openai.createChatCompletion({
      model: "gpt-4",
      messages: promptMessage
    });
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI API Error:", error);
    return "An error occurred while fetching data from OpenAI";
  }
}

// Express Test Route
expressApp.get("/", async (req, res) => {
  try {
    const response = await fetchOpenAIResponse("Test Query");
    res.send(response);
  } catch (error) {
    console.error("Error details:", error);
    res.status(500).send("An error occurred");
  }
});

// Start the Express App
expressApp.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
