const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const autoeat = require('mineflayer-auto-eat').plugin;
const { StateMachine } = require('./state-machine');
const { Idle } = require('./states/idle');
const { processFunction } = require('./functions');
const { getFunctionResponse, getChatResponse } = require('./gpt');
const { log, prompt, getStatus } = require('./util');

// Auth options from command line arguments
const options = {
    host: process.argv[2],
    port: parseInt(process.argv[3]),
    username: process.argv[4],
    password: process.argv[5],
    auth: 'microsoft',
    checkTimeoutInterval: 60 * 10000 // timeout after 600 seconds.
};

function createBot() {
    const bot = mineflayer.createBot(options)

    const lastTenMessages = [];

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(autoeat);

    const stateMachine = new StateMachine(bot)

    bot.once('spawn', () => {
        stateMachine.start(new Idle());
        prompt(bot);
        bot.autoEat.options = {
            priority: 'foodPoints',
            startAt: 14,
            bannedFood: []
        }
    })

    bot.on('autoeat_started', () => {
        console.log('Auto Eat started!')

    })

    bot.on('autoeat_stopped', () => {
        console.log('Auto Eat stopped!')
    })

    bot.on('health', () => {
        if (bot.food === 20) bot.autoEat.disable()
        // Disable the plugin if the bot is at 20 food points
        else bot.autoEat.enable() // Else enable the plugin again
    })

    // log errors and disconnections
    bot.on('end', (reason) => {
        log("Disconnected: " + reason)
    })

    bot.on('error', (reason) => {
        log("Error: " + reason)
    })

    // listen for state events
    bot.on('goal_reached', () => {
        console.log('goal_reached')
        if (stateMachine.currentState().movingFinished) {
            stateMachine.currentState().movingFinished()
        }
    })

    bot.on('mount', () => {
        if (stateMachine.currentState() && stateMachine.currentState().mount) {
            stateMachine.currentState().mount(stateMachine, bot)
        } else {
            bot.dismount(stateMachine, bot);
        }
    })

    bot.on('dismount', () => {
        if (stateMachine.currentState() && stateMachine.currentState().dismount) {
            stateMachine.currentState().dismount(stateMachine, bot)
        }
    })

    bot.on('sleep', () => {
        if (stateMachine.currentState().sleep) {
            stateMachine.currentState().sleep(stateMachine, bot)
        }
    })

    bot.on('wake', () => {
        if (stateMachine.currentState().wake) {
            stateMachine.currentState().wake(stateMachine, bot)
        }
    })

    // listen for messages
    bot.on('message', (jsonMsg) => {
        log(jsonMsg);
        const message = `${jsonMsg}`;
        lastTenMessages.push(message);
        if (lastTenMessages.length > 10) {
            lastTenMessages.shift();
        }
        async function handleChat() {
            if (message.match(/<.*> lb!.*/i)) {
                // TODO
            } else {
                var attempts = 3;
                while(attempts > 0){
                    try {
                        let commandResponse = null;
                        if(message.match(/<Lyrdl>.*/)){
                            var functionMessages = lastTenMessages.slice();
                            if(attempts != 3){
                                functionMessages.push("Remember to only reply with known JSON functions")
                            }
                            const command = (await getFunctionResponse(functionMessages)).content;
                            commandResponse = await processFunction(JSON.parse(command), stateMachine, bot);
                            console.log(commandResponse);
                        }
                        const chat = (await getChatResponse(lastTenMessages, commandResponse)).content;
                        bot.chat(chat);
                        attempts = 0;
                    } catch (error) {
                        console.log(error);
                        console.log("Error processing chat");
                        attempts -= 1;
                    }
                }
            }
        }
        if (!message.match(/<L_Y_R_D_L>.*/)) {
            try {
                handleChat()
            } catch (error) {
                bot.chat("Error processing chat!")
            }
        }
    })

    bot.on('end', createBot)

}

createBot()
