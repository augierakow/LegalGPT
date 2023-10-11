//dev++

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

// Variable to track if the bot is paused
let isPaused = false;

// Listen for any message
boltApp.message(async ({ message, say, next }) => {
  if (isPaused) return; // Do nothing if paused
  if (['@pause', '@resume'].includes(message.text)) return next();
  const userQuery = message.text;
  const gptResponse = await fetchOpenAIResponse(userQuery);
  await say(`Hello, <@${message.user}>, ${gptResponse}`);
});

// Listen for "@pause"
boltApp.message(/@pause/, async ({ say }) => {
  isPaused = true;
  await say("The bot is now paused.");
  return; // Stop propagation
});

// Listen for "@resume"
boltApp.message(/@resume/, async ({ say }) => {
  isPaused = false;
  await say("The bot is now resumed.");
  return; // Stop propagation
});

// Start the Bolt App
(async () => {
  const boltPort = process.env.PORT1;
  if (!boltPort) {
    throw new Error("PORT1 environment variable is not set.");
  }
  await boltApp.start(boltPort);
  console.log(`⚡️ Bolt app is running on port ${boltPort}!`);
})();

// Initialize Express App
const expressApp = express();
const port = process.env.PORT2;
if (!port) {
  throw new Error("PORT2 environment variable is not set.");
}

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
