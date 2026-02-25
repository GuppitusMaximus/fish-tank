const ITEMS = {
    potion:        { id: 'potion',        name: 'Potion',        description: 'Restores HP.',                      price: 15, type: 'heal',          power: 30 },
    super_potion:  { id: 'super_potion',  name: 'Super Potion',  description: 'Restores more HP.',                 price: 30, type: 'heal',          power: 60 },
    revive:        { id: 'revive',        name: 'Revive',        description: 'Revives a fainted fish with 50% HP.', price: 50, type: 'revive',      power: 0.5 },
    shield_potion: { id: 'shield_potion', name: 'Shield Potion', description: 'Grants bonus shield for next battle.', price: 20, type: 'shield_potion', power: 15 }
};

const MAX_INVENTORY = 5;

export { ITEMS, MAX_INVENTORY };
