const Vec3 = require('vec3').Vec3;

// A class to hold the current state and handle state transitions
class StateMachine {

    constructor(bot) {
        this.stateStack = [];
        this.bot = bot;
    }
 
    currentState() {
        return this.stateStack[this.stateStack.length - 1]
    }

    async start(initialState) {
        this.stateStack.push(initialState);
        initialState.stateMachine = new StateMachine(this.bot);
        await this.currentState().enter(this, this.bot);
    }

    async transition(newState, extras) {
        await this.currentState().exit(this, this.bot);
        this.stateStack.pop();
        newState.extras = extras;
        newState.stateMachine = new StateMachine(this.bot);
        this.stateStack.push(newState);
        await this.currentState().enter(this, this.bot);
    }

    async clear() {
        await this.currentState().exit(this, this.bot);
        this.stateStack = [];
    }

    async push(newState, extras) {
        newState.extras = extras;
        newState.stateMachine = new StateMachine(this.bot);
        this.stateStack.push(newState);
    }

    async pop() {
        await this.currentState().exit(this, this.bot);
        this.stateStack.pop();
        if (this.currentState().resume) {
            await this.currentState().resume();
        } else {
            await this.currentState().enter(this, this.bot);
        }
    }
}

const states = {
    Idle: {
        description: function () { return "chill" },
        enter: async function (stateMachine, bot) {
            console.log("Entered Idle state");

            // Bob up and down to show state and keep from being kicked
            this.sneak = false
            while (stateMachine.currentState() === this) {
                bot.setControlState('sneak', this.sneak)
                this.sneak = !this.sneak
                await bot.waitForTicks(this.sneak ? 30 : 5)
            }
        },
        exit: async function (stateMachine, bot) {
            console.log("Exited Idle state");
            bot.setControlState('sneak', false)
        },
        extras: {
            abort: false
        },
        parentMachine: null,
    },

    Follow: {
        description: function () { return "follow " + this.extras.username },
        enter: async function (stateMachine, bot) {
            console.log("Entered Follow state with target: " + this.extras.username);
            // bot.chat("I will follow!");
            this.stateMachine.start(this.states.FollowStart);
        },
        exit: async function (stateMachine, bot) {
            console.log("Exited Follow state");
            this.stateMachine.currentState().exit();
            // bot.chat("Stopped following!")
        },
        extras: {
            username: null,
        },
        movingFinished: function () {
            // Transition back to start when moving has finished so that it can wait until target moves again
            this.stateMachine.transition(this.states.FollowStart)
        },
        stateMachine: null,
        states: {
            FollowStart: {
                enter: async function (stateMachine, bot) {
                    const targetName = states.Follow.extras.username;
                    console.log("Entered FollowStart state with target: " + targetName);

                    const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null;
                    if (!target) {
                        await states.Follow.stateMachine.transition(states.Follow.states.FollowLost);
                    } else {
                        // Keep checking if target has moved away
                        while (states.Follow.stateMachine.currentState() === this) {
                            if (target.position.distanceTo(bot.entity.position) > 2) {
                                await states.Follow.stateMachine.transition(states.Follow.states.Moving);
                                break
                            }
                            await bot.waitForTicks(10)
                        }
                    }
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited FollowStart state");
                },
            },
            Moving: {
                enter: async function (stateMachine, bot) {
                    console.log("Entered Moving state");
                    const targetName = states.Follow.extras.username
                    const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null
                    if (!target) {
                        await states.Follow.stateMachine.transition(states.Follow.states.FollowLost);
                    } else {
                        await move(bot, target.position)
                    }
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited Moving state");
                    bot.pathfinder.stop();
                },
            },
            FollowLost: {
                enter: async function (stateMachine, bot) {
                    console.log("Entered FollowLost state");
                    bot.chat("I can\'t find you!")
                    const targetName = states.Follow.extras.username;

                    // look for target
                    while (states.Follow.stateMachine.currentState() === this) {
                        const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null;
                        if (target) {
                            await states.Follow.stateMachine.transition(states.Follow.states.FollowStart);
                        }
                        await bot.waitForTicks(10);
                    }
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited FollowLost state");
                    bot.chat("I found you!")
                },
            }
        }
    },

    Ride: {
        description: function () { return "ride a boat" },
        enter: async function (stateMachine, bot) {
            console.log("Entered Ride state");
            this.stateMachine.start(this.states.Mounting);
        },
        exit: async function (stateMachine, bot) {
            console.log("Exited Ride state");
            this.stateMachine.currentState().exit();
        },
        stateMachine: null,
        shouldDismount: function (stateMachine, bot) {
            this.stateMachine.transition(this.states.Dismounting)
        },
        mount: function (stateMachine, bot) {
            this.stateMachine.transition(this.states.Riding)
        },
        dismount: function (stateMachine, bot) {
            stateMachine.pop();
        },
        states: {
            Mounting: {
                enter: async function (stateMachine, bot) {
                    console.log("Entered Mounting state");
                    // Find nearest vehicle and attempt to mount
                    const vehicle = bot.nearestEntity((entity) => {
                        return entity.kind && entity.kind.match(/.*Vehicles.*/i)
                    })
                    bot.mount(vehicle)
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited Mounting state");
                },
            },

            Dismounting: {
                enter: async function (stateMachine, bot) {
                    console.log("Entered Dismounting state");
                    try {
                        bot.dismount();
                        stateMachine.pop();
                    } catch (error) {
                        // If we fail to dismount, just do it manually with sneak
                        console.log(error)
                        bot.setControlState('sneak', true);
                        await bot.waitForTicks(5);
                        bot.setControlState('sneak', false);
                    }
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited Dismounting state");
                },
            },

            // All transitions to and from this state are driven by events
            Riding: {
                enter: async function (stateMachine, bot) {
                    console.log("Entered Riding state");
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited Riding state");
                },
            },
        }
    },

    Sleep: {
        description: function () { return "sleep" },
        enter: async function (stateMachine, bot) {
            console.log("Entered Sleep state");
            this.stateMachine.start(this.states.SleepStart);
        },
        exit: async function (stateMachine, bot) {
            console.log("Exited Sleep state");
            this.stateMachine.currentState().exit();
        },
        stateMachine: null,
        shouldWake: function (stateMachine, bot) {
            this.stateMachine.transition(this.states.WakeUp);
        },
        sleep: function (stateMachine, bot) {
            this.stateMachine.transition(this.states.Sleeping);
        },
        wake: function (stateMachine, bot) {
            stateMachine.pop();
        },
        states: {
            SleepStart: {
                enter: async function (stateMachine, bot) {
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
                            stateMachine.pop();
                        }
                    } catch (error) {
                        // "Can only sleep at night or during thunderstorm"
                        console.log(error)
                    }
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited Sleeping state");
                },
            },

            // All transitions to and from this state are driven by events
            Sleeping: {
                enter: async function (stateMachine, bot) {
                    console.log("Entered Sleeping state");
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited Sleeping state");
                },
            },

            WakeUp: {
                enter: async function (stateMachine, bot) {
                    console.log("Entered WakeUp state");
                    bot.wake()
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited WakeUp state");
                },
            },
        }
    },

    Step: {
        description: function () { return "step " + this.extras.direction },
        enter: async function (stateMachine, bot) {
            console.log("Entered Step state with direction: " + this.extras.direction);
            // Set a key, wait a bit, and release it
            bot.setControlState(this.extras.direction, true)
            await bot.waitForTicks(5)
            bot.setControlState(this.extras.direction, false)
            stateMachine.pop();
        },
        exit: async function (stateMachine, bot) {
            console.log("Exited Step state");
        },
        extras: {
            direction: null
        }
    },

    Goto: {
        description: function () {
            if (this.extras.waypoint) {
                return "go to " + this.extras.waypoint ?? this.extras.coordinates.x + " " + this.extras.coordinates.y + " " + this.extras.coordinates.z
            } else {
                return "go to " + this.extras.coordinates.x + " " + this.extras.coordinates.y + " " + this.extras.coordinates.z
            }
        },
        enter: async function (stateMachine, bot) {
            const waypoints = (await readMemory()).waypoints;
            const waypointObject = waypoints[this.extras.waypoint];
            if (waypointObject) {
                if (waypointObject.dimension != bot.game.dimension) {
                    bot.chat("Whoa! That's in the " + waypointObject.dimension.replace("the_", "") + ", I'm in the " + bot.game.dimension.replace("the_", ""))
                } else {
                    this.extras.coordinates.x = waypointObject.x
                    this.extras.coordinates.y = waypointObject.y
                    this.extras.coordinates.z = waypointObject.z
                }
            }
            console.log("Entered GoTo state with coords: " + this.extras.coordinates.x + " " + this.extras.coordinates.y + " " + this.extras.coordinates.z);

            await move(bot, new Vec3(this.extras.coordinates.x, this.extras.coordinates.y, this.extras.coordinates.z), 0)
        },
        exit: async function (stateMachine, bot) {
            console.log("Exited GoTo state");
            bot.pathfinder.stop();
        },
        extras: {
            x: null,
            y: null,
            z: null,
            waypoint: null
        },
        movingFinished: function (stateMachine, bot) {
            stateMachine.pop();
        }
    },

    // Collect and store gunpowder from farm
    Gunpowder: {
        description: function () { return "collect gunpowder, I am currently " + this.stateMachine.currentState().description() },
        enter: async function (stateMachine, bot) {
            console.log("Entered Gunpowder state");
            const startState = this.extras.startState ? this.states[this.extras.startState] : this.states.GunpowderStart
            this.stateMachine.start(startState);
        },
        exit: async function (stateMachine, bot) {
            console.log("Exited Gunpowder state");
            this.stateMachine.currentState().exit();
        },
        extras: {
            startState: null
        },
        resume: async function (stateMachine, bot) {
            console.log("Resumed Gunpowder state");
            // establish correct state and resume it
            if (this.stateMachine.currentState().resume) {
                this.stateMachine.currentState().resume();
            } else {
                this.stateMachine.currentState().enter();
            }
        },
        movingFinished: function (stateMachine, bot) {
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
        stateMachine: null,
        states: {
            GunpowderStart: {
                description: function () { return "getting ready" },
                enter: async function (stateMachine, bot) {
                    console.log("Entered GunpowderStart state");
                    // Establish initial conditions, either accept them and navigate to starting point or inform user that I need to be relocated
                    if (bot.game.dimension != "the_nether") {
                        bot.chat("I need to be in the nether to start this mission!");
                        stateMachine.pop();
                    } else {
                        states.Gunpowder.stateMachine.transition(states.Gunpowder.states.FungustusHubToSpawn);
                    }
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited GunpowderStart state");
                    bot.pathfinder.stop();
                },
            },
            FungustusHubToSpawn: {
                description: function () { return "heading to the gunpowder farm" },
                enter: async function (stateMachine, bot) {
                    console.log("Entered FungustusHubToSpawn state");
                    // Move to portal coords
                    await move(bot, new Vec3(95, 129, -6))
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited FungustusHubToSpawn state");
                    bot.pathfinder.stop();
                },
            },
            WaitForPortalToOverWorld: {
                description: function () { return "going through the portal to the farm" },
                enter: async function (stateMachine, bot) {
                    console.log("Entered WaitForPortalToOverWorld state");
                    await bot.waitForTicks(100);
                    states.Gunpowder.stateMachine.transition(states.Gunpowder.states.WaitForGunpowder)
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited WaitForPortalToOverWorld state");
                },
            },
            WaitForGunpowder: {
                description: function () { return "waiting for the gunpowder, " + this.extras.ticksElapsed + "/" + this.ticksRequired + " ticks elapsed." },
                enter: async function (stateMachine, bot) {
                    console.log("Entered WaitForGunpowder state");
                    this.sneak = false
                    if (!this.extras) {
                        this.extras = {
                            ticksElapsed: 0
                        }
                    }
                    // wait for ticks 100 at a time and update ticksElapsed until 10000 has been reached
                    const interval = 100;
                    while (states.Gunpowder.stateMachine.currentState() === this && this.extras.ticksElapsed < this.ticksRequired) {
                        bot.setControlState('sneak', this.sneak);
                        this.sneak = !this.sneak;
                        await bot.waitForTicks(interval);
                        this.extras.ticksElapsed += interval;
                    }
                    states.Gunpowder.stateMachine.transition(states.Gunpowder.states.WalkToEdge)
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited WaitForGunpowder state");
                },
                ticksRequired: 30000,
                extras: {
                    ticksElapsed: 0,
                }
            },
            WalkToEdge: {
                description: function () { return "jumping off the platform" },
                enter: async function (stateMachine, bot) {
                    console.log("Entered WalkToEdge state");
                    // Move to edge coords
                    await move(bot, new Vec3(760, 176, 25))
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited WalkToEdge state");
                    bot.pathfinder.stop();
                },
            },
            JumpOffPlatform: {
                description: function () { return "falling" },
                enter: async function (stateMachine, bot) {
                    console.log("Entered JumpOffPlatform state");
                    // jump off the edge by walking forward
                    bot.setControlState("sneak", false)
                    bot.setControlState("forward", true)
                    await bot.waitForTicks(5);
                    bot.setControlState("forward", false)
                    // wait until we hit the water?
                    await bot.waitForTicks(30);
                    states.Gunpowder.stateMachine.transition(states.Gunpowder.states.GoToCollection, { direction: 'North' })
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited JumpOffPlatform state");
                },
            },
            GoToCollection: {
                description: function () { return "swimming" },
                enter: async function (stateMachine, bot) {
                    console.log("Entered GoToCollection state");
                    bot.setControlState("jump", true)
                    await move(bot, new Vec3(784, 64, 14))
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited GoToCollection state");
                    bot.setControlState("jump", false)
                    bot.pathfinder.stop();
                },
            },
            GoToChest: {
                description: function () { return "going to the " + this.extras.direction + " chest" },
                enter: async function (stateMachine, bot) {
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
                exit: async function (stateMachine, bot) {
                    console.log("Exited GoToChest state");
                    bot.pathfinder.stop();
                },
                extras: {
                    direction: null
                }
            },
            TakeFromChest: {
                description: function () { return "taking gunpowder from the " + this.extras.direction + " chest" },
                enter: async function (stateMachine, bot) {
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
                            states.Gunpowder.stateMachine.transition(states.Gunpowder.states.GoToChest, { direction: 'East' })
                            break;
                        case 'East':
                            states.Gunpowder.stateMachine.transition(states.Gunpowder.states.GoToChest, { direction: 'South' })
                            break;
                        case 'South':
                            states.Gunpowder.stateMachine.transition(states.Gunpowder.states.GoToChest, { direction: 'West' })
                            break;
                        case 'West':
                            states.Gunpowder.stateMachine.transition(states.Gunpowder.states.GoToPortal)
                            break;
                    }
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited TakeFromChest state");
                },
                extras: {
                    direction: null
                }
            },
            GoToPortal: {
                description: function () { return "heading back to the nether" },
                enter: async function (stateMachine, bot) {
                    console.log("Entered GoToPortal state");
                    // move to portal coords
                    await move(bot, new Vec3(766, 63, 13))
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited GoToPortal state");
                    bot.pathfinder.stop();
                },
                extras: {
                    direction: null
                }
            },
            WaitForPortalToNether: {
                description: function () { return "going through the portal to the nether" },
                enter: async function (stateMachine, bot) {
                    console.log("Entered WaitForPortalToNether state");
                    await bot.waitForTicks(100);
                    states.Gunpowder.stateMachine.transition(states.Gunpowder.states.SpawnToFungustusHub)
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited WaitForPortalToNether state");
                },
            },
            SpawnToFungustusHub: {
                description: function () { return "walking to Fungustus with my cargo" },
                enter: async function (stateMachine, bot) {
                    console.log("Entered SpawnToFungustusHub state");
                    // Move to fungustus hub chest coords
                    await move(bot, new Vec3(730, 129, -3292))
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited SpawnToFungustusHub state");
                    bot.pathfinder.stop();
                },
            },
            PutInChest: {
                description: function () { return "dropping off the cargo" },
                enter: async function (stateMachine, bot) {
                    console.log("Entered PutInChest");
                    // put gunpowder in chest
                    const chest = bot.findBlock({
                        matching: bot.registry.blocksByName['chest'].id,
                        maxDistance: 6
                    })
                    await putAll(bot, chest, 'gunpowder');
                    // Back to start state
                    states.Gunpowder.stateMachine.transition(states.Gunpowder.states.GunpowderStart);
                },
                exit: async function (stateMachine, bot) {
                    console.log("Exited PutInChest state");
                },
            },
        }
    },

    Take: {
        description: function () { return "take items from a chest" },
        enter: async function (stateMachine, bot) {
            console.log("Entered Take");
            // take all items from nearest chest
            const chest = bot.findBlock({
                matching: bot.registry.blocksByName['chest'].id,
                maxDistance: 6
            })
            await takeAll(bot, chest);
            stateMachine.pop();
        },
        exit: async function (stateMachine, bot) {
            console.log("Exited Take state");
        },
    },

    Dump: {
        description: function () { return "dump items in a chest" },
        enter: async function (stateMachine, bot) {
            console.log("Entered Dump");
            // put all items in nearest chest
            const chest = bot.findBlock({
                matching: bot.registry.blocksByName['chest'].id,
                maxDistance: 6
            })
            await putAll(bot, chest);
            stateMachine.pop();
        },
        exit: async function (stateMachine, bot) {
            console.log("Exited Dump state");
        },
    },

    Mission: {
        description: function () { return "doing the " + this.extras.missionName + " mission" },
        enter: async function (stateMachine, bot) {
            console.log("Entered Mission " + this.extras.missionName);
            const missions = (await readMemory()).missions;
            const mission = missions[this.extras.missionName];

            if(mission.looping){
                stateMachine.push(states.Mission, this.extras);
            }
            for (const step in mission.steps){
                stateMachine.push(step.state, step.parameters);
            }
            // start mission
            await stateMachine.currentState().enter(stateMachine, bot);
        },
        exit: async function (stateMachine, bot) {
            console.log("Exited Mission state");
        },
        extras: {
            looping: false,
            missionName: null
        }
    }
};

module.exports = { StateMachine, states };