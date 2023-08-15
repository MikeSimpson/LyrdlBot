const Vec3 = require('vec3').Vec3;
const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { move, putAll, takeAll, readMemory } = require('./util');
const { Idle } = require('./states/idle');

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

    async transition(newState) {
        await this.currentState().exit(this, this.bot);
        newState.stateMachine = new StateMachine(this.bot);
        this.stateStack.push(newState);
        await this.currentState().enter(this, this.bot);
    }

    async clear() {
        await this.currentState().exit(this, this.bot);
        this.stateStack = [new Idle()];
    }

    async push(newState) {
        newState.stateMachine = new StateMachine(this.bot);
        this.stateStack.push(newState);
    }

    async pop() {
        await this.currentState().exit(this, this.bot);
        this.stateStack.pop();
        if (!this.currentState()) {
            this.stateStack.push(new Idle());
        }
        if (this.currentState().resume) {
            await this.currentState().resume();
        } else {
            await this.currentState().enter(this, this.bot);
        }
    }
}

// Collect and store gunpowder from farm
//TODO replace with mission
class Gunpowder {
    description() { return "collect gunpowder, I am currently " + this.stateMachine.currentState().description() }

    extras = {
        step: null
    }

    stateMachine = null

    async enter(stateMachine, bot) {
        console.log("Entered Gunpowder state");
        const startState = this.extras.step ? this.states[this.extras.step] : this.states.GunpowderStart
        this.stateMachine.start(startState);
    }

    async exit(stateMachine, bot) {
        console.log("Exited Gunpowder state");
        this.stateMachine.currentState().exit(this.stateMachine, bot);
    }

    async resume(stateMachine, bot) {
        console.log("Resumed Gunpowder state");
        // establish correct state and resume it
        if (this.stateMachine.currentState().resume) {
            this.stateMachine.currentState().resume();
        } else {
            this.stateMachine.currentState().enter();
        }
    }
    async movingFinished(stateMachine, bot) {
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
    }

    states = {
        GunpowderStart: {
            description: function () { return "getting ready" },
            enter: async function (stateMachine, bot) {
                console.log("Entered GunpowderStart state");
                // Establish initial conditions, either accept them and navigate to starting point or inform user that I need to be relocated
                if (bot.game.dimension != "the_nether") {
                    bot.chat("I need to be in the nether to start this mission!");
                    await stateMachine.pop();
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
}

module.exports = { StateMachine };