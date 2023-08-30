const { Dig } = require('./dig')

class Trench {

    constructor(extras) {
        this.extras = extras
    }

    description() { return "digging a trench" }

    extras = {
        cornerA: null,
        cornerB: null
    }

    y = null

    async enter(stateMachine, bot) {
        if (this.y === null) {
            this.y = this.extras.cornerA.y
        }
        var startX = Math.min(this.extras.cornerA.x, this.extras.cornerB.x)
        var endX = Math.max(this.extras.cornerA.x, this.extras.cornerB.x)
        var startZ = Math.min(this.extras.cornerA.z, this.extras.cornerB.z)
        var endZ = Math.max(this.extras.cornerA.z, this.extras.cornerB.z)
        // push dig tasks one layer at a time  
        for (let x = startX; x <= endX; x++) {
            if (x % 2 == 0) {
                console.log("Zig")
                for (let z = startZ; z <= endZ; z++) {
                    await stateMachine.push(new Dig({
                        coordinates: { x: x, y: this.y, z: z },
                        scaffold: true
                    }))
                }
            } else {
                console.log("Zag")
                for (let z = endZ; z >= startZ; z--) {
                    await stateMachine.push(new Dig({
                        coordinates: { x: x, y: this.y, z: z },
                        scaffold: true
                    }))
                }
            }
        }
        this.y--
        await stateMachine.currentState().enter(stateMachine, bot)
    }
}

module.exports = { Trench }