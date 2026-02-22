// Auto-battler move definitions
// Each combatant has an implicit base attack (scales with ATK/SPD stats)
// plus one unique special move defined here.
//
// damage: flat damage, reduced by DEF (0 = no damage, e.g. heals/buffs)
// cooldown: seconds between uses
// effect: null, poison, heal, or buff
// animation: 'projectile' or 'lunge'

const MOVES = {
    // --- Fish specials (10) ---
    bubble_volley: {
        id: 'bubble_volley',
        name: 'Bubble Volley',
        damage: 12,
        cooldown: 2.5,
        effect: null,
        animation: 'projectile',
        description: 'Fires a rapid burst of bubbles.'
    },
    spike_shield: {
        id: 'spike_shield',
        name: 'Spike Shield',
        damage: 0,
        cooldown: 7,
        effect: { type: 'buff', stat: 'def', amount: 5, duration: 5 },
        animation: 'lunge',
        description: 'Puffs up defensively, boosting DEF.'
    },
    deep_strike: {
        id: 'deep_strike',
        name: 'Deep Strike',
        damage: 35,
        cooldown: 5,
        effect: null,
        animation: 'lunge',
        description: 'A devastating deep-sea blow.'
    },
    trick_shot: {
        id: 'trick_shot',
        name: 'Trick Shot',
        damage: 8,
        cooldown: 1.5,
        effect: null,
        animation: 'projectile',
        description: 'A quick trick shot, fired rapidly.'
    },
    abyssal_beam: {
        id: 'abyssal_beam',
        name: 'Abyssal Beam',
        damage: 30,
        cooldown: 4.5,
        effect: null,
        animation: 'projectile',
        description: 'Fires a beam of deep-sea energy.'
    },
    razor_rush: {
        id: 'razor_rush',
        name: 'Razor Rush',
        damage: 28,
        cooldown: 4,
        effect: null,
        animation: 'lunge',
        description: 'Charges forward with razor-sharp fins.'
    },
    venom_sting: {
        id: 'venom_sting',
        name: 'Venom Sting',
        damage: 15,
        cooldown: 4,
        effect: { type: 'poison', damagePerTick: 5, ticks: 3, interval: 1.5 },
        animation: 'projectile',
        description: 'Stings with venom, poisoning the target.'
    },
    healing_tide: {
        id: 'healing_tide',
        name: 'Healing Tide',
        damage: 0,
        cooldown: 5,
        effect: { type: 'heal', amount: 20 },
        animation: 'lunge',
        description: 'A soothing tide that heals the front fish.'
    },
    tidal_crush: {
        id: 'tidal_crush',
        name: 'Tidal Crush',
        damage: 32,
        cooldown: 5,
        effect: null,
        animation: 'lunge',
        description: 'A crushing wave of water.'
    },
    golden_aura: {
        id: 'golden_aura',
        name: 'Golden Aura',
        damage: 0,
        cooldown: 7,
        effect: { type: 'buff', stat: 'atk', amount: 5, duration: 5 },
        animation: 'lunge',
        description: 'Radiates golden energy, boosting ATK.'
    },

    // --- Monster specials (13) ---
    gnaw: {
        id: 'gnaw',
        name: 'Gnaw',
        damage: 8,
        cooldown: 2,
        effect: null,
        animation: 'lunge',
        description: 'A quick gnawing bite.'
    },
    sonic_screech: {
        id: 'sonic_screech',
        name: 'Sonic Screech',
        damage: 12,
        cooldown: 3,
        effect: null,
        animation: 'projectile',
        description: 'An ear-splitting screech.'
    },
    dagger_throw: {
        id: 'dagger_throw',
        name: 'Dagger Throw',
        damage: 15,
        cooldown: 3,
        effect: null,
        animation: 'projectile',
        description: 'Hurls a rusty dagger.'
    },
    web_venom: {
        id: 'web_venom',
        name: 'Web Venom',
        damage: 12,
        cooldown: 4,
        effect: { type: 'poison', damagePerTick: 4, ticks: 3, interval: 1.5 },
        animation: 'projectile',
        description: 'Spits venomous webbing.'
    },
    bone_throw: {
        id: 'bone_throw',
        name: 'Bone Throw',
        damage: 18,
        cooldown: 3.5,
        effect: null,
        animation: 'projectile',
        description: 'Throws a sharp bone.'
    },
    acid_splash: {
        id: 'acid_splash',
        name: 'Acid Splash',
        damage: 14,
        cooldown: 4,
        effect: { type: 'poison', damagePerTick: 3, ticks: 4, interval: 1 },
        animation: 'projectile',
        description: 'Splashes corrosive acid.'
    },
    ground_slam: {
        id: 'ground_slam',
        name: 'Ground Slam',
        damage: 25,
        cooldown: 5,
        effect: null,
        animation: 'lunge',
        description: 'Slams the ground with massive force.'
    },
    shadow_bolt: {
        id: 'shadow_bolt',
        name: 'Shadow Bolt',
        damage: 16,
        cooldown: 2.5,
        effect: null,
        animation: 'projectile',
        description: 'Fires a bolt of shadow energy.'
    },
    stone_crush: {
        id: 'stone_crush',
        name: 'Stone Crush',
        damage: 30,
        cooldown: 6,
        effect: null,
        animation: 'lunge',
        description: 'Crushes with a massive stone fist.'
    },
    hellfire: {
        id: 'hellfire',
        name: 'Hellfire',
        damage: 28,
        cooldown: 4.5,
        effect: null,
        animation: 'projectile',
        description: 'Unleashes hellish flames.'
    },
    fire_breath: {
        id: 'fire_breath',
        name: 'Fire Breath',
        damage: 35,
        cooldown: 6,
        effect: null,
        animation: 'projectile',
        description: 'Breathes a torrent of fire.'
    },
    dark_nova: {
        id: 'dark_nova',
        name: 'Dark Nova',
        damage: 30,
        cooldown: 5,
        effect: { type: 'poison', damagePerTick: 6, ticks: 3, interval: 1.5 },
        animation: 'projectile',
        description: 'Erupts with dark energy, poisoning the target.'
    },
    cataclysm: {
        id: 'cataclysm',
        name: 'Cataclysm',
        damage: 40,
        cooldown: 5,
        effect: null,
        animation: 'projectile',
        description: 'Unleashes ultimate destructive power.'
    }
};

export default MOVES;
