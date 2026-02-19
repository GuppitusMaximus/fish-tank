// Move types: 'attack' deals damage, 'heal' restores HP, 'buff' modifies stats
// power: for attacks, used in damage formula. For heals, flat HP restored.
// poison: if present, deals this damage per turn for poisonTurns turns
// buff: if present, { stat, amount, turns } — temporary stat boost

const MOVES = {
    splash:       { id: 'splash',       name: 'Splash',       type: 'attack', power: 10, description: 'A weak splash attack.' },
    tackle:       { id: 'tackle',       name: 'Tackle',       type: 'attack', power: 15, description: 'A solid physical hit.' },
    bubble_shot:  { id: 'bubble_shot',  name: 'Bubble Shot',  type: 'attack', power: 20, description: 'Fires a burst of bubbles.' },
    fin_slash:    { id: 'fin_slash',    name: 'Fin Slash',    type: 'attack', power: 25, description: 'A sharp fin strike.' },
    thunder_jolt: { id: 'thunder_jolt', name: 'Thunder Jolt', type: 'attack', power: 30, description: 'An electric shock.' },
    tidal_crush:  { id: 'tidal_crush',  name: 'Tidal Crush',  type: 'attack', power: 35, description: 'A crushing wave of water.' },
    deep_strike:  { id: 'deep_strike',  name: 'Deep Strike',  type: 'attack', power: 40, description: 'A devastating deep-sea blow.' },
    poison_bite:  { id: 'poison_bite',  name: 'Poison Bite',  type: 'attack', power: 15, description: 'Bites and poisons the target.', poison: 5, poisonTurns: 3 },
    heal_splash:  { id: 'heal_splash',  name: 'Heal Splash',  type: 'heal',   power: 25, description: 'Heals with a soothing splash.' },
    harden:       { id: 'harden',       name: 'Harden',       type: 'buff',   power: 0,  description: 'Raises defense for 3 turns.', buff: { stat: 'def', amount: 4, turns: 3 } }
};

export default MOVES;
