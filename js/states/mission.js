const { readMemory } = require('../util')

const { Follow } = require('./follow')
const { Idle } = require('./idle')
const { Ride } = require('./ride')
const { Sleep } = require('./sleep')
const { Step } = require('./step')
const { Deposit } = require('./deposit')
const { Take } = require('./take')
const { Wait } = require('./wait')
const { Goto } = require('./goto')
const { Attack } = require('./attack')
const { Guard } = require('./guard')
const { Drop } = require('./drop')
const { Push } = require('./push')
const { Dig } = require('./dig')
const { Trench } = require('./trench')
const { Tunnel } = require('./tunnel')
const { Craft } = require('./craft')

class Mission {

    constructor(extras) {
        this.extras = extras
    }

    description() { return "doing the " + this.extras.missionName + " mission" }

    async enter(stateMachine, bot) {
        const missions = (await readMemory()).missions
        const mission = missions[this.extras.missionName]

        if(!mission){
            await stateMachine.pop()
            return
        }

        if (mission.looping) {
            stateMachine.push(new Mission(this.extras))
        }
        for (const step of mission.steps.reverse()) {
            console.log("Pushing " + JSON.stringify(step))
            await stateMachine.push(this.getState(step.state, step.parameters))
        }
        // start mission
        await stateMachine.currentState().enter(stateMachine, bot)
    }

    extras = {
        looping: false,
        missionName: null
    }

    getState(name, extras) {
        switch (name) {
            case "Follow":
                return new Follow(extras)
            case "Idle":
                return new Idle(extras)
            case "Ride":
                return new Ride(extras)
            case "Sleep":
                return new Sleep(extras)
            case "Step":
                return new Step(extras)
            case "Deposit":
                return new Deposit(extras)
            case "Take":
                return new Take(extras)
            case "Wait":
                return new Wait(extras)
            case "Goto":
                return new Goto(extras)
            case "Attack":
                return new Attack(extras)
            case "Guard":
                return new Guard(extras)
            case "Drop":
                return new Drop(extras)
            case "Push":
                return new Push(extras)
            case "Dig":
                return new Dig(extras)
            case "Trench":
                return new Trench(extras)
            case "Tunnel":
                return new Tunnel(extras)
            case "Craft":
                return new Craft(extras)
        }
    }
}

module.exports = { Mission }