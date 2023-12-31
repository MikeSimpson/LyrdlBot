const { move } = require('../util')
const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder').pathfinder

class Follow {

    constructor(extras) {
        this.extras = extras
    }

    description() { return "follow " + this.extras.username }

    extras = {
        username: null,
    }

    async enter(stateMachine, bot) {
        this.stateMachine.start(new FollowStart(this))
    }

    async exit(stateMachine, bot) {
        if (this.stateMachine.currentState().exit) {
            this.stateMachine.currentState().exit(stateMachine, bot)
        }
        this.stateMachine.clear()
    }

    async movingFinished() {
        // Transition back to start when moving has finished so that it can wait until target moves again
        this.stateMachine.transition(new FollowStart(this))
    }
}

// Sub states

class FollowStart {
    constructor(parent) {
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        const targetName = this.parent.extras.username

        const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null
        if (!target) {
            await this.parent.stateMachine.transition(new FollowLost(this.parent))
        } else {
            // Keep checking if target has moved away
            while (this.parent.stateMachine.currentState() === this) {
                if (target.position.distanceTo(bot.entity.position) > 2) {
                    await this.parent.stateMachine.transition(new Moving(this.parent))
                    break
                }
                await bot.waitForTicks(10)
            }
        }
    }
}

class Moving {
    constructor(parent) {
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        const targetName = this.parent.extras.username
        const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null
        if (!target) {
            await this.parent.stateMachine.transition(new FollowLost(this.parent))
        } else {
            await move(bot, target.position)
        }
        setTimeout(() => {
            if (this.parent.stateMachine.currentState() === this) {
                this.parent.stateMachine.transition(new FollowStart(this.parent))
            }
        }, 10000)
    }

    async exit(stateMachine, bot) {
        bot.pathfinder.stop()
    }
}

class FollowLost {
    constructor(parent) {
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        const targetName = this.parent.extras.username

        // look for target
        while (this.parent.stateMachine.currentState() === this) {
            const target = (targetName && bot.players[targetName]) ? bot.players[targetName].entity : null
            if (target) {
                await this.parent.stateMachine.transition(new FollowStart(this.parent))
            }
            await bot.waitForTicks(10)
        }
    }
}

module.exports = { Follow }