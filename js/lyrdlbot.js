const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const autoeat = require('mineflayer-auto-eat').plugin;
const { StateMachine } = require('./state-machine');
const { Idle } = require('./states/idle');
const { processFunction } = require('./functions');
const { getFunctionResponse, getChatResponse } = require('./gpt');
const { log, prompt } = require('./util');
const armorManager = require("mineflayer-armor-manager");
const { autototem } = require('mineflayer-auto-totem');
const pvp = require('mineflayer-pvp').plugin;
const toolPlugin = require('mineflayer-tool').plugin;
const Movements = require('mineflayer-pathfinder').Movements;
const { botCreator } = require('./botCreator');

// Auth options from command line arguments
const options = {
    host: process.argv[2],
    port: parseInt(process.argv[3]),
    username: process.argv[4],
    password: process.argv[5],
    auth: 'microsoft',
    checkTimeoutInterval: 60 * 10000, // timeout after 600 seconds.
    disableChatSigning: false
};

var lastHealth;

const lastTenMessages = [];

const stateMachine = new StateMachine();

const obey = ["Lyrdl"];

function createBot() {
    const bot = mineflayer.createBot(options)

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(autoeat);
    bot.loadPlugin(armorManager);
    bot.loadPlugin(autototem);
    bot.loadPlugin(pvp);
    bot.loadPlugin(toolPlugin);

    bot.once('spawn', () => {
        stateMachine.setBot(bot);
        stateMachine.start(new Idle());
        prompt(bot);
        bot.autoEat.options = {
            priority: 'saturation',
            bannedFood: ['golden_apple']
        };
        bot.once("spawn", () => bot.armorManager.equipAll());
        lastHealth = bot.health;

        const defaultMove = new Movements(bot)
        defaultMove.canDig = false
        defaultMove.allow1by1towers = false
        defaultMove.placeCost = 1000000
        defaultMove.allowFreeMotion = true

        bot.pvp.movements = defaultMove;
    })

    bot.on('autoeat_started', () => {
        console.log('Auto Eat started!')

    })

    bot.on('autoeat_stopped', () => {
        console.log('Auto Eat stopped!')
    })

    bot.on('health', () => {
        const hasTotem = bot.inventory.items().find(item => item.name.includes('otem'))
        if (bot.health < 10 && bot.health < lastHealth && !hasTotem) {
            bot.chat("EMERGENCY SHUTDOWN PROTOCOL INTIATED!!");
            log("Emergency shutdown at: " + JSON.stringify(bot.entity.position));
            bot.quit("Emergency Disconnect");
        }

        lastHealth = bot.health;

        if (bot.food === 20) bot.autoEat.disable()
        // Disable the plugin if the bot is at 20 food points
        else bot.autoEat.enable() // Else enable the plugin again
    })

    // log errors and disconnections
    bot.on('end', (reason) => {
        log("Disconnected: " + reason)
        if (reason != "Emergency Disconnect") {
            createBot()
        }
    })

    bot.on('error', (reason) => {
        log("Error: " + reason)
    })

    // listen for state events
    bot.on('goal_reached', () => {
        console.log('goal_reached')
        if (stateMachine.currentState().movingFinished) {
            stateMachine.currentState().movingFinished(stateMachine, bot)
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

    bot.on("physicsTick", async () => {
        bot.autototem.equip()
        if (stateMachine.currentState() && stateMachine.currentState().physicsTick) {
            stateMachine.currentState().physicsTick(stateMachine, bot)
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
                try {
                    processFunction(JSON.parse(message.split("lb! ")[1]), stateMachine, bot);
                } catch (e) {
                    bot.chat(e.message)
                }
            } else if (false) {
                var attempts = 3;
                while (attempts > 0) {
                    try {
                        let commandResponse = null;
                        if (true || message.match(/sleep|zz/i)) {
                            var functionMessages = lastTenMessages.slice();
                            if (attempts != 3) {
                                functionMessages.push("Remember to only reply with known JSON functions")
                            }
                            const command = (await getFunctionResponse(functionMessages)).content;
                            commandResponse = await processFunction(JSON.parse(command), stateMachine, bot);
                            console.log(commandResponse);
                            const chat = (await getChatResponse(lastTenMessages, commandResponse)).content;
                            for (username of obey) {
                                // bot.whisper(username, chat);
                                bot.chat(chat);
                            }
                        }
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
}

createBot();

botCreator.createBot = () => { createBot() };