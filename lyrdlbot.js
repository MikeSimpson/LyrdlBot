const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const { GoalNear } = require('mineflayer-pathfinder').goals;
const fileStream = require('fs');
const { defaultMaxListeners } = require('events');
const Entity = require("prismarine-entity");
const Vec3 = require('vec3').Vec3;
const mineflayerViewer = require('prismarine-viewer').mineflayer;
const autoeat = require('mineflayer-auto-eat').plugin;
const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
    organization: "org-CkmTNbxDhBDD1dFADqcBaclt",
    apiKey: process.env.OPEN_AI_KEY,
});
const openai = new OpenAIApi(configuration);

// A class to hold the current state and handle state transitions
class StateMachine {

    constructor() {
        this.stateStack = [];
    }

    currentState() {
        return this.stateStack[this.stateStack.length - 1]
    }

    async start(initialState) {
        this.stateStack.push(initialState);
        await this.currentState().enter();
    }

    async transition(newState, extras, replace) {
        await this.currentState().exit();
        if (replace ?? !this.currentState().pausable) {
            this.stateStack.pop();
        }
        newState.extras = extras;
        this.stateStack.push(newState);
        await this.currentState().enter();
    }

    async pop() {
        await this.currentState().exit();
        this.stateStack.pop();
        if (this.currentState().resume) {
            this.currentState().resume();
        } else {
            this.currentState().enter();
        }
    }
}

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

    async function idle(replace) {
        stateMachine.transition(stateObjects.Idle, {}, replace)
    }

    const stateMachine = new StateMachine()

    const stateObjects = {
        Idle: {
            description: function () { return "chill" },
            enter: async function () {
                console.log("Entered Idle state");

                // check for previous state and resume it
                if (stateMachine.stateStack.length > 1) {
                    stateMachine.pop()
                }

                // Bob up and down to show state and keep from being kicked
                this.sneak = false
                while (stateMachine.currentState() === this) {
                    bot.setControlState('sneak', this.sneak)
                    this.sneak = !this.sneak
                    await bot.waitForTicks(this.sneak ? 30 : 5)
                }
            },
            exit: async function () {
                console.log("Exited Idle state");
                bot.setControlState('sneak', false)
            },
            extras: {
                abort: false
            }
        },

        Follow: {
            description: function () { return "follow " + this.extras.target },
            enter: async function () {
                console.log("Entered Follow state with target: " + this.extras.target);
                // bot.chat("I will follow!");
                this.stateMachine.start(this.states.FollowStart);
            },
            exit: async function () {
                console.log("Exited Follow state");
                this.stateMachine.currentState().exit();
                // bot.chat("Stopped following!")
            },
            extras: {
                target: null,
            },
            movingFinished: function () {
                // Transition back to start when moving has finished so that it can wait until target moves again
                this.stateMachine.transition(this.states.FollowStart)
            },
            stateMachine: new StateMachine(),
            states: {
                FollowStart: {
                    enter: async function () {
                        const targetName = stateObjects.Follow.extras.target;
                        console.log("Entered FollowStart state with target: " + targetName);

                        const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null;
                        if (!target) {
                            await stateObjects.Follow.stateMachine.transition(stateObjects.Follow.states.FollowLost);
                        } else {
                            // Keep checking if target has moved away
                            while (stateObjects.Follow.stateMachine.currentState() === this) {
                                if (target.position.distanceTo(bot.entity.position) > 2) {
                                    await stateObjects.Follow.stateMachine.transition(stateObjects.Follow.states.Moving);
                                    break
                                }
                                await bot.waitForTicks(10)
                            }
                        }
                    },
                    exit: async function () {
                        console.log("Exited FollowStart state");
                    },
                },
                Moving: {
                    enter: async function () {
                        console.log("Entered Moving state");
                        const targetName = stateObjects.Follow.extras.target
                        const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null
                        if (!target) {
                            await stateObjects.Follow.stateMachine.transition(stateObjects.Follow.states.FollowLost);
                        } else {
                            await move(bot, target.position)
                        }
                    },
                    exit: async function () {
                        console.log("Exited Moving state");
                        bot.pathfinder.stop();
                    },
                },
                FollowLost: {
                    enter: async function () {
                        console.log("Entered FollowLost state");
                        bot.chat("I can\'t find you!")
                        const targetName = stateObjects.Follow.extras.target;

                        // look for target
                        while (stateObjects.Follow.stateMachine.currentState() === this) {
                            const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null;
                            if (target) {
                                await stateObjects.Follow.stateMachine.transition(stateObjects.Follow.states.FollowStart);
                            }
                            await bot.waitForTicks(10);
                        }
                    },
                    exit: async function () {
                        console.log("Exited FollowLost state");
                        bot.chat("I found you!")
                    },
                }
            }
        },

        Ride: {
            description: function () { return "ride a boat" },
            enter: async function () {
                console.log("Entered Ride state");
                this.stateMachine.start(this.states.Mounting);
            },
            exit: async function () {
                console.log("Exited Ride state");
                this.stateMachine.currentState().exit();
            },
            pausable: true,
            stateMachine: new StateMachine(),
            shouldDismount: function () {
                this.stateMachine.transition(this.states.Dismounting)
            },
            mount: function () {
                this.stateMachine.transition(this.states.Riding)
            },
            dismount: function () {
                idle()
            },
            states: {
                Mounting: {
                    enter: async function () {
                        console.log("Entered Mounting state");
                        // Find nearest vehicle and attempt to mount
                        const vehicle = bot.nearestEntity((entity) => {
                            return entity.kind && entity.kind.match(/.*Vehicles.*/i)
                        })
                        bot.mount(vehicle)
                    },
                    exit: async function () {
                        console.log("Exited Mounting state");
                    },
                },

                Dismounting: {
                    enter: async function () {
                        console.log("Entered Dismounting state");
                        try {
                            bot.dismount();
                            idle();
                        } catch (error) {
                            // If we fail to dismount, just do it manually with sneak
                            console.log(error)
                            bot.setControlState('sneak', true);
                            await bot.waitForTicks(5);
                            bot.setControlState('sneak', false);
                        }
                    },
                    exit: async function () {
                        console.log("Exited Dismounting state");
                    },
                },

                // All transitions to and from this state are driven by events
                Riding: {
                    enter: async function () {
                        console.log("Entered Riding state");
                    },
                    exit: async function () {
                        console.log("Exited Riding state");
                    },
                },
            }
        },

        Sleep: {
            description: function () { return "sleep" },
            enter: async function () {
                console.log("Entered Sleep state");
                this.stateMachine.start(this.states.SleepStart);
            },
            exit: async function () {
                console.log("Exited Sleep state");
                this.stateMachine.currentState().exit();
            },
            stateMachine: new StateMachine(),
            shouldWake: function () {
                this.stateMachine.transition(this.states.WakeUp);
            },
            sleep: function () {
                this.stateMachine.transition(this.states.Sleeping);
            },
            wake: function () {
                idle();
            },
            states: {
                SleepStart: {
                    enter: async function () {
                        console.log("Entered Sleeping state");
                        // Find a bed
                        const bed = bot.findBlock({
                            matching: (block) => {
                                return bot.isABed(block)
                            }
                        })
                        try {
                            if (bed) {
                                await bot.sleep(bed)
                            } else {
                                bot.chat("Oh woops, I can't find a bed!")
                                idle();
                            }
                        } catch (error) {
                            // "Can only sleep at night or during thunderstorm"
                            console.log(error)
                            idle();
                        }
                    },
                    exit: async function () {
                        console.log("Exited Sleeping state");
                    },
                },

                // All transitions to and from this state are driven by events
                Sleeping: {
                    enter: async function () {
                        console.log("Entered Sleeping state");
                    },
                    exit: async function () {
                        console.log("Exited Sleeping state");
                    },
                },

                WakeUp: {
                    enter: async function () {
                        console.log("Entered WakeUp state");
                        bot.wake()
                    },
                    exit: async function () {
                        console.log("Exited WakeUp state");
                    },
                },
            }
        },

        Step: {
            description: function () { return "step " + this.extras.direction },
            enter: async function () {
                console.log("Entered Step state with direction: " + this.extras.direction);
                // Set a key, wait a bit, and release it
                bot.setControlState(this.extras.direction, true)
                await bot.waitForTicks(5)
                bot.setControlState(this.extras.direction, false)
                idle()
            },
            exit: async function () {
                console.log("Exited Step state");
            },
            extras: {
                direction: null
            }
        },

        Goto: {
            description: function () {
                if (this.extras.waypoint) {
                    return "go to " + this.extras.waypoint ?? this.extras.x + " " + this.extras.y + " " + this.extras.z
                } else {
                    return "go to " + this.extras.x + " " + this.extras.y + " " + this.extras.z
                }
            },
            enter: async function () {
                const waypoints = (await readMemory()).waypoints;
                const waypointObject = waypoints[this.extras.waypoint];
                if (waypointObject) {
                    if (waypointObject.dimension != bot.game.dimension) {
                        bot.chat("Whoa! That's in the " + waypointObject.dimension.replace("the_", "") + ", I'm in the " + bot.game.dimension.replace("the_", ""))
                    } else {
                        this.extras.x = waypointObject.x
                        this.extras.y = waypointObject.y
                        this.extras.z = waypointObject.z
                    }
                }
                console.log("Entered GoTo state with coords: " + this.extras.x + " " + this.extras.y + " " + this.extras.z);

                await move(bot, new Vec3(this.extras.x, this.extras.y, this.extras.z), 0)
            },
            exit: async function () {
                console.log("Exited GoTo state");
                bot.pathfinder.stop();
            },
            pausable: true,
            extras: {
                x: null,
                y: null,
                z: null,
                waypoint: null
            },
            movingFinished: function () {
                idle(true);
            }
        },

        // Collect and store gunpowder from farm
        Gunpowder: {
            description: function () { return "collect gunpowder, I am currently " + this.stateMachine.currentState().description() },
            enter: async function () {
                console.log("Entered Gunpowder state");
                const startState = this.extras.startState ? this.states[this.extras.startState] : this.states.GunpowderStart
                this.stateMachine.start(startState);
            },
            exit: async function () {
                console.log("Exited Gunpowder state");
                this.stateMachine.currentState().exit();
            },
            extras: {
                startState: null
            },
            pausable: true,
            resume: async function () {
                console.log("Resumed Gunpowder state");
                // establish correct state and resume it
                if (this.stateMachine.currentState().resume) {
                    this.stateMachine.currentState().resume();
                } else {
                    this.stateMachine.currentState().enter();
                }
            },
            movingFinished: function () {
                switch (this.stateMachine.currentState()) {
                    case this.states.FungustusHubToSpawn:
                        this.stateMachine.transition(this.states.WaitForPortalToOverWorld);
                        break;
                    case this.states.WalkToEdge:
                        this.stateMachine.transition(this.states.JumpOffPlatform);
                        break;
                    case this.states.GoToCollection:
                        this.stateMachine.transition(this.states.GoToChest, { direction: 'North' });
                        break;
                    case this.states.GoToChest:
                        this.stateMachine.transition(this.states.TakeFromChest, this.stateMachine.currentState().extras);
                        break;
                    case this.states.GoToPortal:
                        this.stateMachine.transition(this.states.WaitForPortalToNether);
                        break;
                    case this.states.SpawnToFungustusHub:
                        this.stateMachine.transition(this.states.PutInChest);
                        break;
                }
            },
            stateMachine: new StateMachine(),
            states: {
                GunpowderStart: {
                    description: function () { return "getting ready" },
                    enter: async function () {
                        console.log("Entered GunpowderStart state");
                        // Establish initial conditions, either accept them and navigate to starting point or inform user that I need to be relocated
                        if (bot.game.dimension != "the_nether") {
                            bot.chat("I need to be in the nether to start this mission!");
                            idle(true);
                        } else {
                            stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.FungustusHubToSpawn);
                        }
                    },
                    exit: async function () {
                        console.log("Exited GunpowderStart state");
                        bot.pathfinder.stop();
                    },
                },
                FungustusHubToSpawn: {
                    description: function () { return "heading to the gunpowder farm" },
                    enter: async function () {
                        console.log("Entered FungustusHubToSpawn state");
                        // Move to portal coords
                        await move(bot, new Vec3(95, 129, -6))
                    },
                    exit: async function () {
                        console.log("Exited FungustusHubToSpawn state");
                        bot.pathfinder.stop();
                    },
                },
                WaitForPortalToOverWorld: {
                    description: function () { return "going through the portal to the farm" },
                    enter: async function () {
                        console.log("Entered WaitForPortalToOverWorld state");
                        await bot.waitForTicks(100);
                        stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.WaitForGunpowder)
                    },
                    exit: async function () {
                        console.log("Exited WaitForPortalToOverWorld state");
                    },
                },
                WaitForGunpowder: {
                    description: function () { return "waiting for the gunpowder, " + this.extras.ticksElapsed + "/" + this.ticksRequired + " ticks elapsed." },
                    enter: async function () {
                        console.log("Entered WaitForGunpowder state");
                        this.sneak = false
                        if (!this.extras) {
                            this.extras = {
                                ticksElapsed: 0
                            }
                        }
                        // wait for ticks 100 at a time and update ticksElapsed until 10000 has been reached
                        const interval = 100;
                        while (stateObjects.Gunpowder.stateMachine.currentState() === this && this.extras.ticksElapsed < this.ticksRequired) {
                            bot.setControlState('sneak', this.sneak);
                            this.sneak = !this.sneak;
                            await bot.waitForTicks(interval);
                            this.extras.ticksElapsed += interval;
                        }
                        stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.WalkToEdge)
                    },
                    exit: async function () {
                        console.log("Exited WaitForGunpowder state");
                    },
                    ticksRequired: 30000,
                    extras: {
                        ticksElapsed: 0,
                    }
                },
                WalkToEdge: {
                    description: function () { return "jumping off the platform" },
                    enter: async function () {
                        console.log("Entered WalkToEdge state");
                        // Move to edge coords
                        await move(bot, new Vec3(760, 176, 25))
                    },
                    exit: async function () {
                        console.log("Exited WalkToEdge state");
                        bot.pathfinder.stop();
                    },
                },
                JumpOffPlatform: {
                    description: function () { return "falling" },
                    enter: async function () {
                        console.log("Entered JumpOffPlatform state");
                        // jump off the edge by walking forward
                        bot.setControlState("sneak", false)
                        bot.setControlState("forward", true)
                        await bot.waitForTicks(5);
                        bot.setControlState("forward", false)
                        // wait until we hit the water?
                        await bot.waitForTicks(30);
                        stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.GoToCollection, { direction: 'North' })
                    },
                    exit: async function () {
                        console.log("Exited JumpOffPlatform state");
                    },
                },
                GoToCollection: {
                    description: function () { return "swimming" },
                    enter: async function () {
                        console.log("Entered GoToCollection state");
                        bot.setControlState("jump", true)
                        await move(bot, new Vec3(784, 64, 14))
                    },
                    exit: async function () {
                        console.log("Exited GoToCollection state");
                        bot.setControlState("jump", false)
                        bot.pathfinder.stop();
                    },
                },
                GoToChest: {
                    description: function () { return "going to the " + this.extras.direction + " chest" },
                    enter: async function () {
                        console.log("Entered GoToChest state for direction: " + this.extras.direction);
                        switch (this.extras.direction) {
                            case 'North':
                                await move(bot, new Vec3(782, 64, 8))
                                break;
                            case 'East':
                                await move(bot, new Vec3(788, 64, 12))
                                break;
                            case 'South':
                                await move(bot, new Vec3(784, 64, 19))
                                break;
                            case 'West':
                                await move(bot, new Vec3(778, 64, 14))
                                break;
                        }
                    },
                    exit: async function () {
                        console.log("Exited GoToChest state");
                        bot.pathfinder.stop();
                    },
                    extras: {
                        direction: null
                    }
                },
                TakeFromChest: {
                    description: function () { return "taking gunpowder from the " + this.extras.direction + " chest" },
                    enter: async function () {
                        console.log("Entered TakeFromChest state for direction: " + this.extras.direction);
                        // take from chest
                        const chest = bot.findBlock({
                            matching: bot.registry.blocksByName['chest'].id,
                            maxDistance: 6
                        })
                        await takeAll(bot, chest);
                        // transition to next chest state
                        switch (this.extras.direction) {
                            case 'North':
                                stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.GoToChest, { direction: 'East' })
                                break;
                            case 'East':
                                stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.GoToChest, { direction: 'South' })
                                break;
                            case 'South':
                                stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.GoToChest, { direction: 'West' })
                                break;
                            case 'West':
                                stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.GoToPortal)
                                break;
                        }
                    },
                    exit: async function () {
                        console.log("Exited TakeFromChest state");
                    },
                    extras: {
                        direction: null
                    }
                },
                GoToPortal: {
                    description: function () { return "heading back to the nether" },
                    enter: async function () {
                        console.log("Entered GoToPortal state");
                        // move to portal coords
                        await move(bot, new Vec3(766, 63, 13))
                    },
                    exit: async function () {
                        console.log("Exited GoToPortal state");
                        bot.pathfinder.stop();
                    },
                    extras: {
                        direction: null
                    }
                },
                WaitForPortalToNether: {
                    description: function () { return "going through the portal to the nether" },
                    enter: async function () {
                        console.log("Entered WaitForPortalToNether state");
                        await bot.waitForTicks(100);
                        stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.SpawnToFungustusHub)
                    },
                    exit: async function () {
                        console.log("Exited WaitForPortalToNether state");
                    },
                },
                SpawnToFungustusHub: {
                    description: function () { return "walking to Fungustus with my cargo" },
                    enter: async function () {
                        console.log("Entered SpawnToFungustusHub state");
                        // Move to fungustus hub chest coords
                        await move(bot, new Vec3(730, 129, -3292))
                    },
                    exit: async function () {
                        console.log("Exited SpawnToFungustusHub state");
                        bot.pathfinder.stop();
                    },
                },
                PutInChest: {
                    description: function () { return "dropping off the cargo" },
                    enter: async function () {
                        console.log("Entered PutInChest");
                        // put gunpowder in chest
                        const chest = bot.findBlock({
                            matching: bot.registry.blocksByName['chest'].id,
                            maxDistance: 6
                        })
                        await putAll(bot, chest, 'gunpowder');
                        // Back to start state
                        stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.GunpowderStart);
                    },
                    exit: async function () {
                        console.log("Exited PutInChest state");
                    },
                },
            }
        },

        Take: {
            description: function () { return "take items from a chest" },
            enter: async function () {
                console.log("Entered Take");
                // take all items from nearest chest
                const chest = bot.findBlock({
                    matching: bot.registry.blocksByName['chest'].id,
                    maxDistance: 6
                })
                await takeAll(bot, chest);
                idle();
            },
            exit: async function () {
                console.log("Exited Take state");
            },
        },

        Dump: {
            description: function () { return "dump items in a chest" },
            enter: async function () {
                console.log("Entered Dump");
                // put all items in nearest chest
                const chest = bot.findBlock({
                    matching: bot.registry.blocksByName['chest'].id,
                    maxDistance: 6
                })
                await putAll(bot, chest);
                idle();
            },
            exit: async function () {
                console.log("Exited Dump state");
            },
        },
    };

    bot.once('spawn', () => {
        stateMachine.start(stateObjects.Idle);
        prompt(bot);
        mineflayerViewer(bot, { port: 3007, firstPerson: true });
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
            stateMachine.currentState().mount()
        } else {
            bot.dismount();
        }
    })

    bot.on('dismount', () => {
        if (stateMachine.currentState() && stateMachine.currentState().dismount) {
            stateMachine.currentState().dismount()
        }
    })

    bot.on('sleep', () => {
        if (stateMachine.currentState().sleep) {
            stateMachine.currentState().sleep()
        }
    })

    bot.on('wake', () => {
        if (stateMachine.currentState().wake) {
            stateMachine.currentState().wake()
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
            const status = await getStatus(stateMachine, bot);
            // console.log(JSON.stringify(status))
            if (message.match(/<.*> lb!.*/i)) {
                processMessage(`{"command": "${message.split("lb! ")[1]}"}}`);
            } else {
                try {
                    const content = (await getGpt(lastTenMessages, status)).content;
                    processMessage(JSON.parse(content));
                } catch (error) {
                    console.log(error);
                    bot.chat("I'm a little slow today, start your message with lb! to bypass my higher brain functions")
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

    async function processMessage(response) {
        if (response.message) {
            bot.chat(response.message);
        }
        const command = response.command
        if (command) {
            switch (command) {
                case "FOLLOW":
                    // TODO handle error and send LLM a message to correct it
                    stateMachine.transition(stateObjects.Follow, response.extras);
                    break;
                case "STOP":
                    // TODO Clear statestack
                    idle(true);
                    break;
                case "GET_IN":
                    stateMachine.transition(stateObjects.Ride);
                    break;
                case "GET_OUT":
                    if (stateMachine.currentState().shouldDismount) {
                        stateMachine.currentState().shouldDismount();
                    }
                    break;
                case "SLEEP":
                    stateMachine.transition(stateObjects.Sleep);
                    break;
                case "WAKE":
                    if (stateMachine.currentState().shouldWake) {
                        stateMachine.currentState().shouldWake();
                    }
                    break;
                case "STEP":
                    stateMachine.transition(stateObjects.Step, response.extras);
                    break;
                case "GUNPOWDER":
                    stateMachine.transition(stateObjects.Gunpowder, response.extras);
                    break;
                case "GOTO":
                    stateMachine.transition(stateObjects.Goto, response.extras);
                    break;
                case "TAKE":
                    stateMachine.transition(stateObjects.Take);
                    break;
                case "DUMP":
                    stateMachine.transition(stateObjects.Dump);
                    break;
                case "WAYPOINT":
                    try {
                        const waypoint = {
                            x: response.extras.x,
                            y: response.extras.y,
                            z: response.extras.z,
                            dimension: response.extras.dimension,
                            description: response.extras.description ?? ""
                        }
                        updateMemory((memory) => {
                            memory.waypoints[response.extras.name] = waypoint;
                            return memory
                        })
                    } catch (error){
                        console.log(error)
                    }
                    break;
                // For bypass commands
                case "UP2":
                    bot.chat("My current task is to " + stateMachine.currentState().description())
                    break;
                case "@":
                    const p = bot.entity.position;
                    bot.chat("I'm at " + Math.round(p.x) + " " + Math.round(p.y) + " " + Math.round(p.z) + " in the " + bot.game.dimension.replace("the_", ""));
                    break;
                case "STATUS":
                    async function reportStatus() {
                        const status = await getStatus(stateMachine, bot);
                        bot.chat(status);
                    }
                    reportStatus();
                    break;
            }
        }
    }
}

createBot()

// Helper functions

// Prepend time stamp and write message to log file and console
const log = (message) => {
    let stampedMessage = `${new Date().toLocaleString("en-UK")}: ${message}\n`;
    fileStream.appendFile('logs.txt', stampedMessage, function (err) {
        if (err) throw err;
    });
    console.log(stampedMessage);
}

function updateMemory(update) {
    fileStream.readFile('memory.json', 'utf-8', callback_function = function (err, data) {
        if (err) throw err;
        const memory = JSON.parse(data)
        fileStream.writeFile('memory.json', JSON.stringify(update(memory)), function (err) {
            if (err) throw err;
        })

    })
}

async function readMemory() {
    const data = fileStream.readFileSync('memory.json', 'utf-8', callback_function = function (err) {
        if (err) throw err;
    })
    const memory = JSON.parse(data)
    return memory
}

async function readPrompt() {
    const data = fileStream.readFileSync('prompt.txt', 'utf-8', callback_function = function (err) {
        if (err) throw err;
    })
    return data
}

// Read command line text and post it as a message in game
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

const prompt = (bot) => {
    readline.question('', msg => {
        bot.chat(msg)
        prompt(bot)
    })
}

async function getGpt(lastTenMessages, status) {
    const messages = [
        { role: "system", content: (await readPrompt()) + JSON.stringify(status) }
    ]
    for (const message of lastTenMessages) {
        if (message.match(/<L_Y_R_D_L>.*/)) {
            messages.push({ role: "assistant", content: `{"message":"${message.split("<L_Y_R_D_L> ")[1]}"}`})
        } else {
            messages.push({ role: "user", content: message })
        }
    }
    // I find appending this as a user message, ensures that answer follow the format.
    messages.push({ role: "user", content: "Remember to only speak in JSON" })
    messages.push({ role: "user", content: "Remember not to copy any of the example messages, but to use your own words" })
    messages.push({ role: "user", content: "Remember to pass a value for 'command' when you are asked to do something" })

    const chatCompletion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: messages,
    });
    const completion = chatCompletion.data.choices[0].message;
    console.log(completion);
    return completion;
}

async function getStatus(stateMachine, bot) {
    return {
        efficiency: `${bot.health}/20`,
        powerLevel: `${bot.food}/20`,
        location: {
            x: bot.entity.position.x,
            y: bot.entity.position.y,
            z: bot.entity.position.z,
            dimension: bot.game.dimension,
        },todo all caps
        task: stateMachine.currentState() ? stateMachine.currentState().description() : "Booting up",
        waypoints: (await readMemory()).waypoints
    }
}

async function move(bot, position, range) {
    const defaultMove = new Movements(bot)
    defaultMove.canDig = false
    defaultMove.allow1by1towers = false
    defaultMove.allowFreeMotion = true

    // Start following the target
    bot.pathfinder.setMovements(defaultMove)
    bot.pathfinder.setGoal(new GoalNear(position.x, position.y, position.z, range ?? 1))
}

async function takeAll(bot, chestBlock) {

    const window = await bot.openContainer(chestBlock)

    for (const item of window.containerItems()) {
        await withdrawItem(item, item.count)
    }

    window.close()

    async function withdrawItem(item, amount) {
        if (item) {
            try {
                await window.withdraw(item.type, null, amount)
                console.log(`withdrew ${amount} ${item.name}`)
            } catch (err) {
                console.log(`unable to withdraw ${amount} ${item.name}`)
            }
        } else {
            console.log(`unknown item ${name}`)
        }
    }
}

// Put everything not in the hotbar into target chest
async function putAll(bot, chest, itemName) {

    const window = await bot.openContainer(chest)

    for (const item of window.items()) {
        if (!itemName || item.name == itemName) {
            await depositItem(item, item.count)
        }
    }

    window.close()

    async function depositItem(item, amount) {
        if (item) {
            try {
                await window.deposit(item.type, null, amount)
                console.log(`deposited ${amount} ${item.name}`)
            } catch (err) {
                console.log(`unable to deposit ${amount} ${item.name}`)
            }
        } else {
            console.log(`unknown item ${name}`)
        }
    }
}
