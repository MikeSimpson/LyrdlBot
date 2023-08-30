const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder').pathfinder
const pvp = require('mineflayer-pvp').plugin

class Attack {

    constructor(extras) {
        this.extras = extras
    }

    description() { return "attack " + this.extras.username }

    extras = {
        username: null,
    }

    async enter(stateMachine, bot) {
        this.stateMachine.start(new AttackStart(this))
    }

    async exit(stateMachine, bot) {
        if (this.stateMachine.currentState().exit) {
            this.stateMachine.currentState().exit(stateMachine, bot)
        }
        this.stateMachine.clear()
    }
}

// Sub states

class AttackStart {
    constructor(parent){
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        const targetName = this.parent.extras.username

        setTimeout(() => {
            const sword = bot.inventory.items().find(item => item.name.includes('sword'))
            if (sword) bot.equip(sword, 'hand')
          }, 150)

        const player = bot.players[this.parent.extras.username]

        if (!player) {
            await this.parent.stateMachine.transition(new AttackLost(this.parent))
        } else {
            await this.parent.stateMachine.transition(new Attacking(this.parent))
        }
    }
}

class Attacking {
    constructor(parent){
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        const player = bot.players[this.parent.extras.username]
        bot.pvp.attack(player.entity)
        setTimeout(() => {
            if (this.parent.stateMachine.currentState() === this) {
                this.parent.stateMachine.transition(new AttackStart(this.parent))
            }
        }, 10000)
    }

    async exit(stateMachine, bot) {
        bot.pvp.stop()
    }
}

class AttackLost {
    constructor(parent){
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        // look for target
        while (this.parent.stateMachine.currentState() === this) {
            const player = bot.players[this.parent.extras.username]

            if (player) {
                await this.parent.stateMachine.transition(new Attacking(this.parent))
            }
            await bot.waitForTicks(10)
        }
    }
}

module.exports = { Attack }