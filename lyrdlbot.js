const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const { GoalNear } = require('mineflayer-pathfinder').goals;
const fileStream = require('fs');
const { defaultMaxListeners } = require('events');
const Entity = require("prismarine-entity");
const {
    StateTransition,
    BotStateMachine,
    EntityFilters,
    BehaviorFollowEntity,
    BehaviorLookAtEntity,
    BehaviorGetClosestEntity,
    NestedStateMachine } = require("mineflayer-statemachine");
const Vec3 = require('vec3').Vec3;

// Auth options from command line arguments
const options = {
    host: process.argv[2],
    port: parseInt(process.argv[3]),
    username: process.argv[4],
    password: process.argv[5],
    auth: 'microsoft',
    checkTimeoutInterval: 60 * 10000 // timeout after 600 seconds.
};

// Set up the bot with auth options
const bot = mineflayer.createBot(options);

bot.loadPlugin(pathfinder);
bot.loadPlugin(require('mineflayer-pathfinder').pathfinder);

// A class to hold the current state and handle state transitions
class StateMachine {
    async start(initialState) {
        this.currentState = initialState;
        await this.currentState.enter();
    }

    async transition(newState, extras) {
        await this.currentState.exit();
        this.currentState = newState;
        this.currentState.extras = extras;
        await this.currentState.enter();
    }

    async idle() {
        this.transition(stateObjects.Idle)
    }

    async resume() {
        await this.currentState.exit();
        this.currentState = this.parkedState;
        this.parkedState = null;
        if (this.currentState.resume) {
            await this.currentState.resume();
        }
    }
}

const stateMachine = new StateMachine()

const stateObjects = {
    Idle: {
        enter: async function () {
            console.log("Entered Idle state");

            // check for parked state and resume it
            if (stateMachine.parkedState) {
                stateMachine.transition(parkedState)
            }

            // Bob up and down to show state and keep from being kicked
            this.sneak = false
            while (stateMachine.currentState === this) {
                bot.setControlState('sneak', this.sneak)
                this.sneak = !this.sneak
                await bot.waitForTicks(this.sneak ? 30 : 5)
            }
        },
        exit: async function () {
            console.log("Exited Idle state");
            bot.setControlState('sneak', false)
        },
    },

    Follow: {
        enter: async function () {
            console.log("Entered Follow state with target: " + this.extras.targetName);
            bot.chat("I will follow!");
            this.stateMachine.start(this.states.FollowStart);
        },
        exit: async function () {
            console.log("Exited Follow state");
            this.stateMachine.currentState.exit();
            bot.chat("Stopped following!")
        },
        extras: {
            targetName: null,
        },
        movingFinished: function () {
            // Transition back to start when moving has finished so that it can wait until target moves again
            this.stateMachine.transition(this.states.FollowStart)
        },
        stateMachine: new StateMachine(),
        states: {
            FollowStart: {
                enter: async function () {
                    const targetName = stateObjects.Follow.extras.targetName;
                    console.log("Entered FollowStart state with target: " + targetName);

                    const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null;
                    if (!target) {
                        await stateObjects.Follow.stateMachine.transition(stateObjects.Follow.states.FollowLost);
                    } else {
                        // Keep checking if target has moved away
                        while (stateObjects.Follow.stateMachine.currentState === this) { // todo test if we need to bring back the name property
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
                    const targetName = stateObjects.Follow.extras.targetName
                    const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null
                    await move(bot, target.position)
                },
                exit: async function () {
                    console.log("Exited Moving state");
                },
            },
            FollowLost: {
                enter: async function () {
                    console.log("Entered FollowLost state");
                    bot.chat("I can\'t find you!")
                    const targetName = stateObjects.Follow.extras.targetName;

                    // look for target
                    while (stateObjects.Follow.stateMachine.currentState === this) {
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
        enter: async function () {
            console.log("Entered Ride state");
            this.stateMachine.start(this.states.RideStart);
        },
        exit: async function () {
            console.log("Exited Ride state");
            this.stateMachine.currentState.exit();
        },
        stateMachine: new StateMachine(),
        shouldDismount: function () {
            this.stateMachine.transition(this.states.ShouldDismount)
        },
        mount: function () {
            this.stateMachine.transition(this.states.Riding)
        },
        dismount: function () {
            stateMachine.idle()
        },
        states: {
            RideStart: {
                enter: async function () {
                    console.log("Entered RideStart state");
                    // Find nearest vehicle and attempt to mount
                    const vehicle = bot.nearestEntity((entity) => {
                        return entity.kind && entity.kind.match(/.*Vehicles.*/i)
                    })
                    bot.mount(vehicle)
                },
                exit: async function () {
                    console.log("Exited RideStart state");
                },
            },

            ShouldDismount: {
                enter: async function () {
                    console.log("Entered ShouldDismount state");
                    try {
                        bot.dismount();
                        stateMachine.idle();
                    } catch (error) {
                        // If we fail to dismount, just do it manually with sneak
                        console.log(error)
                        bot.setControlState('sneak', true);
                        await bot.waitForTicks(5);
                        bot.setControlState('sneak', false);
                    }
                },
                exit: async function () {
                    console.log("Exited ShouldDismount state");
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
        enter: async function () {
            console.log("Entered Sleep state");
            this.stateMachine.start(this.states.SleepStart);
        },
        exit: async function () {
            console.log("Exited Sleep state");
            this.stateMachine.currentState.exit();
        },
        stateMachine: new StateMachine(),
        shouldWake: function () {
            this.stateMachine.transition(this.states.WakeUp);
        },
        sleep: function () {
            this.stateMachine.transition(this.states.Sleeping);
        },
        wake: function () {
            stateMachine.idle();
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
                            stateMachine.idle();
                        }
                    } catch (error) {
                        // "Can only sleep at night or during thunderstorm"
                        console.log(error)
                        stateMachine.idle();
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
        enter: async function () {
            console.log("Entered Step state with direction: " + this.extras.direction);
            // Set a key, wait a bit, and release it
            bot.setControlState(this.extras.direction, true)
            await bot.waitForTicks(5)
            bot.setControlState(this.extras.direction, false)
            stateMachine.idle()
        },
        exit: async function () {
            console.log("Exited Step state");
        },
        extras: {
            direction: null
        }
    },

    // Collect and store gunpowder from farm
    Gunpowder: {
        enter: async function () {
            console.log("Entered Gunpowder state");
            this.stateMachine.start(this.states.GunpowderStart);
        },
        exit: async function () {
            console.log("Exited Gunpowder state");
            this.stateMachine.currentState.exit();
            // Store state for recovery if interrupted
            stateMachine.parkedState = this
        },
        resume: async function () {
            console.log("Resumed Gunpowder state");
            // establish correct state and resume it
            if (this.stateMachine.currentState.resume) {
                this.stateMachine.currentState.resume();
            } else {
                this.stateMachine.currentState.enter();
            }
        },
        movingFinished: function () {
            switch (this.stateMachine.currentState) {
                case this.states.GunpowderStart:
                    this.stateMachine.transition(this.states.FungustusHubToSpawn);
                    break;
                case this.states.FungustusHubToSpawn:
                    this.stateMachine.transition(this.states.WaitForPortalToOverWorld);
                    break;
                case this.states.WalkToEdge:
                    this.stateMachine.transition(this.states.JumpOffPlatform);
                    break;
                case this.states.GoToChest:
                    this.stateMachine.transition(this.states.TakeFromChest, this.currentState.extras);
                    break;
                case this.states.GoToPortal:
                    this.stateMachine.transition(this.states.WaitForPortalToNether);
                    break;
            }
        },
        stateMachine: new StateMachine(),
        states: {
            GunpowderStart: {
                enter: async function () {
                    console.log("Entered GunpowderStart state");
                    // Establish initial conditions, either accept them and navigate to starting point or inform user that I need to be relocated
                    await move(bot, Vec3(111, 128, -21)) // TODO update coords after test
                },
                exit: async function () {
                    console.log("Exited GunpowderStart state");
                },
            },
            FungustusHubToSpawn: {
                enter: async function () {
                    console.log("Entered FungustusHubToSpawn state");
                    // Move to portal coords
                    await move(bot, Vec3(95, 129, -6))
                },
                exit: async function () {
                    console.log("Exited FungustusHubToSpawn state");
                },
            },
            WaitForPortalToOverWorld: {
                enter: async function () {
                    console.log("Entered WaitForPortalToOverWorld state");
                    await bot.waitForTicks(300); // TODO test required ticks
                    stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.WaitForGunpowder)
                },
                exit: async function () {
                    console.log("Exited WaitForPortalToOverWorld state");
                },
            },
            WaitForGunpowder: {
                enter: async function () {
                    console.log("Entered WaitForGunpowder state");
                    this.sneak = false
                    // wait for ticks 100 at a time and update ticksElapsed until 10000 has been reached
                    const required = 1000; // TODO test
                    const interval = 100;
                    while (stateObjects.Gunpowder.stateMachine.currentState.name === this.name && this.extras.ticksElapsed < required) {
                        bot.setControlState('sneak', this.sneak);
                        this.sneak = !this.sneak;
                        await bot.waitForTicks(interval);
                        this.extras.ticksElapsed += interval;
                    }
                },
                exit: async function () {
                    console.log("Exited WaitForGunpowder state");
                },
                extras: {
                    ticksElapsed: 0
                }
            },
            WalkToEdge: {
                enter: async function () {
                    console.log("Entered WalkToEdge state");
                    // Move to edge coords
                    await move(bot, Vec3(760, 176, 25))
                },
                exit: async function () {
                    console.log("Exited WalkToEdge state");
                },
            },
            JumpOffPlatform: {
                enter: async function () {
                    console.log("Entered JumpOffPlatform state");
                    // jump off the edge by walking forward
                    bot.setControlState("forward", true)
                    await bot.waitForTicks(5);
                    bot.setControlState("forward", false)
                    // wait until we hit the water?
                    await bot.waitForTicks(30); // TODO test timing
                    stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.GoToChest, { direction: 'North' })
                },
                exit: async function () {
                    console.log("Exited JumpOffPlatform state");
                },
            },
            GoToChest: {
                enter: async function () {
                    console.log("Entered GoToChest state for direction: " + this.extras.direction);
                    switch (this.extras.direction) {
                        case 'North':
                            await move(bot, Vec3(782, 64, 8))
                            break;
                        case 'East':
                            await move(bot, Vec3(788, 64, 12))
                            break;
                        case 'South':
                            await move(bot, Vec3(784, 64, 19))
                            break;
                        case 'West':
                            await move(bot, Vec3(778, 64, 14))
                            break;
                    }
                },
                exit: async function () {
                    console.log("Exited GoToChest state");
                },
                extras: {
                    direction: null
                }
            },
            TakeFromChest: {
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
                            stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.GoToChest, { direction: 'East' })
                            break;
                        case 'East':
                            stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.GoToChest, { direction: 'South' })
                            break;
                        case 'South':
                            stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.GoToChest, { direction: 'West' })
                            break;
                        case 'West':
                            stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.GoToPortal)
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
                enter: async function () {
                    console.log("Entered GoToPortal state for direction: " + this.extras.direction);
                    // move to portal coords
                    await move(bot, Vec3(766, 63, 13))
                },
                exit: async function () {
                    console.log("Exited GoToPortal state");
                },
                extras: {
                    direction: null
                }
            },
            WaitForPortalToNether: {
                enter: async function () {
                    console.log("Entered WaitForPortalToNether state");
                    await bot.waitForTicks(300); // TODO test
                    stateObjects.Gunpowder.stateMachine.transition(stateObjects.Gunpowder.states.SpawnToFungustusHub)
                },
                exit: async function () {
                    console.log("Exited WaitForPortalToNether state");
                },
            },
            SpawnToFungustusHub: {
                enter: async function () {
                    console.log("Entered SpawnToFungustusHub state");
                    // Move to fungustus hub chest coords
                    await move(bot, Vec3(111, 128, -21)) // TODO update coords after testing
                },
                exit: async function () {
                    console.log("Exited SpawnToFungustusHub state");
                },
            },
            PutInChest: {
                enter: async function () {
                    console.log("Entered PutInChest");
                    // put gunpowder in chest
                    const chest = bot.findBlock({
                        matching: bot.registry.blocksByName['chest'].id,
                        maxDistance: 6
                    })
                    await putAll(bot, chest);
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
        enter: async function () {
            console.log("Entered Take");
            // take all items from nearest chest
            const chest = bot.findBlock({
                matching: bot.registry.blocksByName['chest'].id,
                maxDistance: 6
            })
            await takeAll(bot, chest);
            stateMachine.idle();
        },
        exit: async function () {
            console.log("Exited Take state");
        },
    },

    Dump: {
        enter: async function () {
            console.log("Entered Dump");
            // put all items in nearest chest
            const chest = bot.findBlock({
                matching: bot.registry.blocksByName['chest'].id,
                maxDistance: 6
            })
            await putAll(bot, chest);
            stateMachine.idle();
        },
        exit: async function () {
            console.log("Exited Dump state");
        },
    },
};

bot.once('spawn', () => {
    stateMachine.start(stateObjects.Idle);
    prompt();
})

// log errors and disconnections
bot.on('end', (reason) => {
    log("Disconnected: " + reason)
})

bot.on('error', (reason) => {
    log("Error: " + reason)
})

// listen for any message and log it
bot.on('message', (jsonMsg) => {
    log(jsonMsg)
})

// listen for state events
bot.on('goal_reached', () => {
    console.log('goal_reached')
    if (stateMachine.currentState.movingFinished) {
        stateMachine.currentState.movingFinished()
    }
})

bot.on('mount', () => {
    if (stateMachine.currentState.mount) {
        stateMachine.currentState.mount()
    }
})

bot.on('dismount', () => {
    if (stateMachine.currentState.dismount) {
        stateMachine.currentState.dismount()
    }
})

bot.on('sleep', () => {
    if (stateMachine.currentState.sleep) {
        stateMachine.currentState.sleep()
    }
})

bot.on('wake', () => {
    if (stateMachine.currentState.wake) {
        stateMachine.currentState.wake()
    }
})

// listen for chat messages
bot.on('chat', (username, message) => {
    // Respond to messages directed at the bot
    matchesMe = message.match(new RegExp(".*" + bot.username + "|l!|lb.*", "i"))
    matchesSleep = message.match(/.*(sleep|zz).*/i)
    if (username != bot.username && matchesMe || message.match(/.*lb!.*/i) || matchesSleep) {
        if (message.match(/.*follow.*/i)) {
            stateMachine.transition(stateObjects.Follow, { targetName: username });
        }
        else if (message.match(/.*stop.*/i)) {
            stateMachine.idle();
        }
        else if (message.match(/.*get in.*/i)) {
            stateMachine.transition(stateObjects.Ride);
        }
        else if (message.match(/.*get out.*/i)) {
            if (stateMachine.currentState.shouldDismount) {
                stateMachine.currentState.shouldDismount();
            }
        }
        else if (matchesSleep) {
            stateMachine.transition(stateObjects.Sleep);
        }
        else if (message.match(/.*wake up.*/i)) {
            if(stateMachine.currentState.shouldWake){
                stateMachine.currentState.shouldWake();
            } else {
                bot.chat("I'm not asleep!")
            }
        }
        else if (message.match(/.*step.*/i)) {
            const step = message.split("step ")[1]
            stateMachine.transition(stateObjects.Step, { direction: step });
        }
        else if (message.match(/.*take.*/i)) {
            stateMachine.transition(stateObjects.Take);
        }
        else if (message.match(/.*dump.*/i)) {
            stateMachine.transition(stateObjects.Dump);
        }
        else if (message.match(/.*gunpowder.*/i)) {
            stateMachine.transition(stateObjects.Gunpowder);
        }
        else if (message.match(/.*@.*/i)) {
            bot.chat("I'm at: " + bot.entity.position);
        }
        else if (message.match(/.*status.*/i)) {
            bot.chat("I feel nothing!");
        }
        else if (false && message.match(/.*help.*/i)) {
            bot.chat("Lyrdl Bot commands:"
                + "\nlb follow -> make me follow you (WIP - cannot go through doors)"
                + "\nlb stop -> make me return to idle state"
                + "\nlb get in -> make me get in the nearest boat"
                + "\nlb get out -> make me get out of a boat"
                + "\nlb sleep -> make me sleep in the nearest bed"
                + "\nlb take -> make me take all items from the nearest chest (untested)"
                + "\nlb dump -> make me dump all items in the nearest chest (untested)"
                + "\nlb gunpowder -> send me on a mission to collect gunpowder (WIP)"
                + "\nlb @ -> ask for my location"
                + "\nlb status -> ask me how I'm feeling (WIP)"
                + "\nOn the roadmap:"
                + "\nAuto eating"
                + "\nHandle doors"
                + "\nAlphabetical item sorting"
                + "\nActivate mob switch"
                + "\nLLM interface")
        }
        else if (matchesMe) {
            bot.chat("You talking to me? Say 'lb help' for tips.")
        }
    }
})

// Helper functions

// Prepend time stamp and write message to log file and console
const log = (message) => {
    let stampedMessage = `${new Date().toLocaleString("en-UK")}: ${message}\n`
    fileStream.appendFile('logs.txt', stampedMessage, function (err) {
        if (err) throw err;
    })
    console.log(stampedMessage)
}

// Read command line text and post it as a message in game
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

const prompt = () => {
    readline.question('', msg => {
        bot.chat(msg)
        prompt()
    })
}

async function move(bot, position) {
    const defaultMove = new Movements(bot)
    defaultMove.canDig = false
    defaultMove.allow1by1towers = false

    // Start following the target
    bot.pathfinder.setMovements(defaultMove)
    bot.pathfinder.setGoal(new GoalNear(position.x, position.y, position.z, 1))
}

async function takeAll(bot, chestBlock) {

    const window = await bot.openContainer(chestBlock)

    for (const item of window.containerItems()) {
        withdrawItem(item, 1)
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
async function putAll(bot, chest) {

    const window = await bot.openContainer(chestBlock)

    for (const item of window.items()) {
        depositItem(item, 1)
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