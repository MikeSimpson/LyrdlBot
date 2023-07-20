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

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(require('mineflayer-pathfinder').pathfinder);
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
            description: function () { return "follow " + this.extras.targetName },
            enter: async function () {
                console.log("Entered Follow state with target: " + this.extras.targetName);
                bot.chat("I will follow!");
                this.stateMachine.start(this.states.FollowStart);
            },
            exit: async function () {
                console.log("Exited Follow state");
                this.stateMachine.currentState().exit();
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
                            while (stateObjects.Follow.stateMachine.currentState() === this) { // todo test if we need to bring back the name property
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
                        const targetName = stateObjects.Follow.extras.targetName;

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
                this.stateMachine.start(this.states.RideStart);
            },
            exit: async function () {
                console.log("Exited Ride state");
                this.stateMachine.currentState().exit();
            },
            pausable: true,
            stateMachine: new StateMachine(),
            shouldDismount: function () {
                this.stateMachine.transition(this.states.ShouldDismount)
            },
            mount: function () {
                this.stateMachine.transition(this.states.Riding)
            },
            dismount: function () {
                idle()
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

        GoTo: {
            description: function () { return "go to " + this.extras.x + " " + this.extras.y + " " + this.extras.z },
            enter: async function () {
                console.log("Entered GoTo state with coords: " + this.extras.x + " " + this.extras.y + " " + this.extras.z);
                bot.setControlState("jump", true)
                await move(bot, new Vec3(this.extras.x, this.extras.y, this.extras.z), 0)
            },
            exit: async function () {
                console.log("Exited GoTo state");
                bot.setControlState("jump", false)
                bot.pathfinder.stop();
            },
            pausable: true,
            extras: {
                x: null,
                y: null,
                z: null
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
                this.stateMachine.start(this.extras.startState ?? this.states.GunpowderStart);
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
                    description: function () { return "waiting for the gunpowder, " + this.extras.ticksElapsed + "/" + this.extras.ticksRequired + " ticks elapsed." },
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
                        while (stateObjects.Gunpowder.stateMachine.currentState() === this && this.extras.ticksElapsed < this.extras.ticksRequired) {
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
                    extras: {
                        ticksElapsed: 0,
                        ticksRequired: 30000
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
                        await bot.waitForTicks(30); // TODO test timing
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

    // listen for any message and log it
    bot.on('message', (jsonMsg) => {
        log(jsonMsg)
    })

    // listen for state events
    bot.on('goal_reached', () => {
        console.log('goal_reached')
        if (stateMachine.currentState().movingFinished) {
            stateMachine.currentState().movingFinished()
        }
    })

    bot.on('mount', () => {
        if (stateMachine.currentState().mount) {
            stateMachine.currentState().mount()
        }
    })

    bot.on('dismount', () => {
        if (stateMachine.currentState().dismount) {
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

    // listen for chat messages
    bot.on('chat', (username, message) => {
        // Respond to messages directed at the bot
        matchesMe = message.match(new RegExp(".*" + bot.username + "|l!|lb.*", "i"))
        matchesSleep = message.match(/.*(sleep|zz).*/i) && !message.match(/.*sleep ->.*/i)
        if (username != bot.username && matchesMe || message.match(/.*lb!.*/i) || matchesSleep) {
            if (message.match(/.*follow.*/i)) {
                stateMachine.transition(stateObjects.Follow, { targetName: username });
            }
            else if (message.match(/.*stop.*/i)) {
                idle(true);
            }
            else if (message.match(/.*get in.*/i)) {
                stateMachine.transition(stateObjects.Ride);
            }
            else if (message.match(/.*get out.*/i)) {
                if (stateMachine.currentState().shouldDismount) {
                    stateMachine.currentState().shouldDismount();
                }
            }
            else if (matchesSleep) {
                stateMachine.transition(stateObjects.Sleep);
            }
            else if (message.match(/.*wake.*/i)) {
                if (stateMachine.currentState().shouldWake) {
                    stateMachine.currentState().shouldWake();
                } else {
                    bot.chat("I'm not asleep!");
                }
            }
            else if (message.match(/.*step.*/i)) {
                const step = message.split("step ")[1];
                stateMachine.transition(stateObjects.Step, { direction: step });
            }
            else if (message.match(/.*gunpowder.*/i)) {
                const state = message.split("gunpowder ")[1]
                const extras = state ? {
                    startState: stateObjects.Gunpowder.states[state]
                } : null
                stateMachine.transition(stateObjects.Gunpowder, extras);
            }
            else if (message.match(/.*goto.*/i)) {
                async function goTo() {
                    const waypoints = (await readMemory()).waypoints;
                    console.log("memory: " + waypoints);
                    const args = message.split("goto ")[1]
                    const waypoint = waypoints[args]
                    if (!waypoint && args.split(" ").length != 3) {
                        bot.chat("I don't know how to get there!")
                    } else if (waypoint.d != bot.game.dimension) {
                        bot.chat("Whoa! That's in the " + waypoint.d.replace("the_", "") + ", I'm in the " + bot.game.dimension.replace("the_", ""))
                    }
                    else {
                        const coords = waypoint ? [waypoints[args].x, waypoints[args].y, waypoints[args].z] : args.split(" ");
                        stateMachine.transition(stateObjects.GoTo, { x: coords[0], y: coords[1], z: coords[2] });
                        bot.chat("On my way!")
                    }
                }
                goTo()
            }
            else if (message.match(/.*take.*/i)) {
                stateMachine.transition(stateObjects.Take);
            }
            else if (message.match(/.*dump.*/i)) {
                stateMachine.transition(stateObjects.Dump);
            }
            else if (message.match(/.*up2.*/i)) {
                bot.chat("My current task is to " + stateMachine.currentState().description())
            }
            else if (message.match(/.*@.*/i)) {
                const p = bot.entity.position;
                bot.chat("I'm at " + Math.round(p.x) + " " + Math.round(p.y) + " " + Math.round(p.z) + " in the " + bot.game.dimension.replace("the_", ""));
            }
            else if (message.match(/.*status.*/i)) {
                bot.chat("I feel nothing!");
            }
            else if (message.match(/.*waypoints.*/i)) {
                async function waypoints() {
                    const waypoints = (await readMemory()).waypoints;
                    for (const [key, value] of Object.entries(waypoints)) {
                        const desc = value.description ? " -> " + value.description : ""
                        bot.chat(key + desc + " at " + value.x + " " + value.y + " " + value.z + " in " + value.d.replace("_", " "));
                        await bot.waitForTicks(20);
                    }
                }
                waypoints();
            }
            else if (message.match(/.*waypoint.*/i)) {
                const args = message.split("waypoint ")[1].split(" ")
                if (args.length < 3 || args.length > 4) {
                    bot.chat("Not enough arguments, try 'lb waypoint [name] [x] [y] [z] [overworld|the_nether|the_end]'")
                } else {
                    const waypoint = {
                        x: args[1],
                        y: args[2],
                        z: args[3],
                        d: args[4] ?? "overworld"
                    }
                    updateMemory((memory) => {
                        memory.waypoints[args[0]] = waypoint;
                        return memory
                    })
                    bot.chat("Set waypoint " + args[0]);
                }
            }
            else if (message.match(/.*help.*/i)) {
                async function spitHelp() {
                    const text = `Lyrdl Bot commands:
lb follow -> make me follow you (WIP - cannot go through doors)
lb stop -> make me return to idle state
lb get in -> make me get in the nearest boat
lb get out -> make me get out of a boat
lb step [forward | back | left | right] -> make me take a step in the given direction
lb goto [x] [y] [z] -> make me head to the given coords
lb goto [waypoint] -> make me head to the given waypoint
lb waypoint [name] [x] [y] [z] [overworld | the_nether | the_end] -> save a waypoint with the given name coords and dimmension (see waypoints in "memory.json")
lb waypoints -> list all waypoints
lb sleep -> make me sleep in the nearest bed
lb wake -> make me wake up
lb take -> make me take all items from the nearest chest
lb dump -> make me dump all items in the nearest chest
lb gunpowder -> send me on a mission to collect gunpowder
lb @ -> ask for my location
lb up2 -> ask for my current task
lb status -> ask me how I'm feeling (WIP)
lb go die in a hole -> ask me to attempt to punch a hole straight down until I die (WIP)`
                    const lines = text.split("\n")
                    for (var i = 0; i < lines.length; i++) {
                        bot.chat(lines[i]);
                        await bot.waitForTicks(20);
                    }
                }
                spitHelp()
            }
            else if (matchesMe) {
                bot.chat("You talking to me? Say 'lb help' for tips.")
            }
        }
    })

    bot.on('end', createBot)
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
