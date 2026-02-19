const ITEMS = {
    potion:       { id: 'potion',       name: 'Potion',       description: 'Restores 30 HP.',       price: 15, type: 'heal',   power: 30 },
    super_potion: { id: 'super_potion', name: 'Super Potion', description: 'Restores 60 HP.',       price: 30, type: 'heal',   power: 60 },
    revive:       { id: 'revive',       name: 'Revive',       description: 'Revives a fainted fish with 50% HP.', price: 50, type: 'revive', power: 0.5 },
    atk_boost:    { id: 'atk_boost',    name: 'Attack Candy', description: 'Permanently +2 ATK.',   price: 80, type: 'stat',   stat: 'atk', amount: 2 },
    def_boost:    { id: 'def_boost',    name: 'Defense Candy', description: 'Permanently +2 DEF.',  price: 80, type: 'stat',   stat: 'def', amount: 2 }
};

// Max inventory size
const MAX_INVENTORY = 10;

export { ITEMS, MAX_INVENTORY };
