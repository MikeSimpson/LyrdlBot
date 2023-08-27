const { move } = require('../util');
const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { getChatResponse } = require('../gpt');

class Guard {

    constructor(extras) {
        this.extras = extras;
    }

    description() { return "guard " + this.extras.username }

    extras = {
        username: null
    }

    sentryPosition = null

    async enter(stateMachine, bot) {
        console.log("Entered Guard state with target: " + this.extras.username);
        if(!this.extras.username){
            this.sentryPosition = bot.entity.position;
        }
        this.stateMachine.start(new GuardIdle(this));
    }

    async exit(stateMachine, bot) {
        console.log("Exited Guard state");
        this.stateMachine.currentState().exit(stateMachine, bot);
        this.stateMachine.clear();
    }

    async movingFinished() {
        // Transition back to start when moving has finished so that it can wait until target moves again
        if (this.stateMachine.currentState().constructor.name == "GuardFollow") {
            this.stateMachine.transition(new GuardIdle(this));
        }
    }

    async physicsTick(stateMachine, bot) {
        const filter = e => (e.type === 'mob' || e.type === 'hostile') && e.position.distanceTo(bot.entity.position) < 16 
        && e.mobType !== 'Armor Stand' // Mojang classifies armor stands as mobs for some reason?
        && !e.metadata.find((it) => it && it.match && it.match("text")) // Check for no name tag
        && e.mobType !== 'Zombified Piglin' // Don't make them angry

        const entity = bot.nearestEntity(filter)
        const targetName = this.extras.username;
        const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null;
        const position = target?.position ?? this.sentryPosition;
        if (entity && position && position.distanceTo(bot.entity.position) < 16) {
            this.stateMachine.transition(new GuardAttack(this));
        }
        
        if (this.stateMachine.currentState().physicsTick) {
            this.stateMachine.currentState().physicsTick(stateMachine, bot)
        }
    }
}

// Sub states

class GuardIdle {
    constructor(parent) {
        this.parent = parent;
    }

    async enter(stateMachine, bot) {
        const targetName = this.parent.extras.username;
        console.log("Entered GuardIdle state with target: " + targetName);

        const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null;
        const position = target?.position ?? this.parent.sentryPosition;
        if (!position) {
            await this.parent.stateMachine.transition(new GuardLost(this.parent));
        } else {
            // Keep checking if target has moved away
            while (this.parent.stateMachine.currentState() === this) {
                if (position.distanceTo(bot.entity.position) > 2) {
                    await this.parent.stateMachine.transition(new GuardFollow(this.parent));
                    break
                }
                await bot.waitForTicks(10)
            }
        }
    }

    async exit(stateMachine, bot) {
        console.log("Exited GuardIdle state");
    }
}

class GuardFollow {
    constructor(parent) {
        this.parent = parent;
    }

    async enter(stateMachine, bot) {
        console.log("Entered GuardFollow state");
        const targetName = this.parent.extras.username
        const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null
        const position = target?.position ?? this.parent.sentryPosition;
        if (!position) {
            await this.parent.stateMachine.transition(new GuardLost(this.parent));
        } else {
            await move(bot, position)
        }
        setTimeout(() => {
            if (this.parent.stateMachine.currentState() === this) {
                this.parent.stateMachine.transition(new GuardIdle(this.parent));
            }
        }, 10000)
    }

    async exit(stateMachine, bot) {
        console.log("Exited GuardFollow state");
        bot.pathfinder.stop();
    }
}

class GuardAttack {
    constructor(parent) {
        this.parent = parent;
    }

    async enter(stateMachine, bot) {
    }

    async physicsTick(stateMachine, bot) {
        // Check to see if out of range of player
        const targetName = this.parent.extras.username
        const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null;
        const position = target?.position ?? this.parent.sentryPosition;

        if (!position) {
            // bot.chat(await getChatResponse(["You have lost sight of the player"]))
            await this.parent.stateMachine.transition(new GuardLost(this.parent));
        } else if(position.distanceTo(bot.entity.position) > 20) {
            await this.parent.stateMachine.transition(new GuardIdle(this.parent));
        } else {
            const filter = e => (e.type === 'mob' || e.type === 'hostile') && e.position.distanceTo(bot.entity.position) < 16 
            && e.mobType !== 'Armor Stand' // Mojang classifies armor stands as mobs for some reason?
            && !e.metadata.find((it) => it && it.match && it.match("text")) // Check for no name tag
            && e.mobType !== 'Zombified Piglin'  // Don't make them angry

            const entity = bot.nearestEntity(filter)
            if (entity) {
                setTimeout(() => {
                    const sword = bot.inventory.items().find(item => item.name.includes('sword'))
                    if (sword) bot.equip(sword, 'hand')
                  }, 150)
                // Start attacking
                bot.pvp.attack(entity)
            } else {
                await this.parent.stateMachine.transition(new GuardIdle(this.parent));
            }
        }
    }

    async exit(stateMachine, bot) {
    }
}

class GuardLost {
    constructor(parent) {
        this.parent = parent;
    }

    async enter(stateMachine, bot) {
        console.log("Entered GuardLost state");
        const targetName = this.parent.extras.username;

        // look for target
        while (this.parent.stateMachine.currentState() === this) {
            const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null;
            if (target) {
                await this.parent.stateMachine.transition(new GuardIdle(this.parent));
            }
            await bot.waitForTicks(10);
        }
    }
    async exit(stateMachine, bot) {
        console.log("Exited GuardLost state");
    }
}

module.exports = { Guard };