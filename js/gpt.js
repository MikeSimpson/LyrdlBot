const { chatExamples } = require('./examples');
const fileStream = require('fs');
const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
    organization: "org-CkmTNbxDhBDD1dFADqcBaclt",
    apiKey: process.env.OPEN_AI_KEY,
});
const openai = new OpenAIApi(configuration);

async function getFunctionResponse(lastTenMessages) {
    const waypoints = ["withertop_lower_gate"];
    const missions = ["dance"];
    const prompt = (await readPrompt('prompt/function.txt'))
        .replace("<WAYPOINTS>", JSON.stringify(waypoints))
        .replace("<MISSIONS>", JSON.stringify(missions));
    const messages = [
        { role: "system", content: prompt }
    ]

    for (const example of chatExamples) {
        messages.push({ role: "user", content: example.message })
        messages.push({ role: "assistant", content: example.function })
    }
    messages.push({ role: "user", content: "Remember to only use the functions provided to you and respond only with JSON" })
    for (const message of lastTenMessages) {
        if (message.match(/<L_Y_R_D_L>.*/)) {
            messages.push({ role: "system", content: `${message.split("<L_Y_R_D_L> ")[1]}` })
        } else {
            messages.push({ role: "user", content: message })
        }
    }

    const chatCompletion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: messages,
        // functions: functions,
        temperature: 0.5,
    });
    const completion = chatCompletion.data.choices[0].message;
    console.log(completion);
    return completion;
}

async function getChatResponse(lastTenMessages, commandResponse) {
    const messages = [
        { role: "system", content: await readPrompt('prompt/chat.txt') }
    ]
    for (const example of chatExamples) {
        messages.push({ role: "user", content: example.message });
        messages.push({ role: "assistant", content: example.response });
    }
    for (const message of lastTenMessages) {
        if (message.match(/<L_Y_R_D_L>.*/)) {
            messages.push({ role: "assistant", content: `${message.split("<L_Y_R_D_L> ")[1]}` })
        } else {
            messages.push({ role: "user", content: message });
        }
    }

    if (commandResponse) {
        messages.push({ role: "system", content: "The outcome of your most recent command was: " + commandResponse + " You should inform the player about this result" });
    }

    const chatCompletion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: messages,
        // functions: functions,
        temperature: 1,
    });
    const completion = chatCompletion.data.choices[0].message;
    console.log(completion);
    return completion;
}

async function readPrompt(file) {
    const data = fileStream.readFileSync(file, 'utf-8', callback_function = function (err) {
        if (err) throw err;
    })
    return data
}

module.exports = { getFunctionResponse, getChatResponse };