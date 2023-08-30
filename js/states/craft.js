const Vec3 = require('vec3').Vec3

class Craft {

    constructor(extras) {
        this.extras = extras
    }

    description() { return "craft " + this.extras.item }

    extras = {
        item: null
    }

    outerStateMachine = null

    async enter(stateMachine, bot) {
        this.outerStateMachine = stateMachine
        this.stateMachine.start(new PlaceBench(this))
    }

    async exit(stateMachine, bot) {
        if (this.stateMachine.currentState().exit) {
            this.stateMachine.currentState().exit(stateMachine, bot)
        }
        this.stateMachine.clear()
    }
}

class PlaceBench {
    constructor(parent) {
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        // todo find an existing bench
        const tableId = bot.registry.itemsByName.crafting_table.id // Get the correct id
        if (bot.registry.itemsByName.totem_of_undying) {
            const table = bot.inventory.findInventoryItem(tableId, null)
            if (table) {
                bot.equip(table)
            }
        }
        // attempt to place crafting bench
        try {
            await bot.placeBlock(bot.blockAt(bot.entity.position.offset(0, 0, 1)), new Vec3(0, 1, 0))
            this.parent.tablePos = bot.entity.position.offset(0, 0, 1)
        } catch (e) {
            try {
                await bot.placeBlock(bot.blockAt(bot.entity.position.offset(0, 0, -1)), new Vec3(0, 1, 0))
                this.parent.tablePos = bot.entity.position.offset(0, 0, -1)
            } catch (e) {
                try {
                    await bot.placeBlock(bot.blockAt(bot.entity.position.offset(1, 0, 0)), new Vec3(0, 1, 0))
                    this.parent.tablePos = bot.entity.position.offset(1, 0, 0)
                } catch (e) {
                    try {
                        await bot.placeBlock(bot.blockAt(bot.entity.position.offset(-1, 0, 0)), new Vec3(0, 1, 0))
                        this.parent.tablePos = bot.entity.position.offset(-1, 0, 0)
                    } catch (e) { }
                }
            }
        }

        await this.parent.stateMachine.transition(new CraftItem(this.parent))
    }
}

class CraftItem {
    constructor(parent) {
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        const craftingTable = bot.findBlock({
            matching: (block) => {
                return block.name.includes("table")
            }
        })
        try {
            const itemId = bot.registry.itemsByName[this.parent.extras.item].id // Get the correct id

            const recipe = bot.recipesFor(itemId, null, 1, craftingTable)[0]
            await bot.craft(recipe, 1, craftingTable)
            await this.parent.stateMachine.transition(new CollectBench(this.parent))
        } catch (e) {
            console.log(e)
            await this.parent.outerStateMachine.pop()
        }
    }
}

class CollectBench {
    constructor(parent) {
        this.parent = parent
    }

    async enter(stateMachine, bot) {
        const craftingTable = bot.findBlock({
            matching: (block) => {
                return block.name.includes("table")
            }
        })
        await bot.dig(craftingTable)
        // todo pick up item
        await this.parent.outerStateMachine.pop()
    }
}

module.exports = { Craft }