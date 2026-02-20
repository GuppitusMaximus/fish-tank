const DISPLAY_FONT = "'Cinzel', 'Georgia', serif";
const BODY_FONT = "'Almendra', 'Georgia', serif";

export const TEXT_STYLES = {
    TITLE_LARGE: {
        fontSize: '28px',
        fontFamily: DISPLAY_FONT,
        color: '#f0c040',
        fontStyle: 'bold'
    },
    TITLE_MEDIUM: {
        fontSize: '18px',
        fontFamily: DISPLAY_FONT,
        color: '#f0c040',
        fontStyle: 'bold'
    },
    TITLE_SMALL: {
        fontSize: '15px',
        fontFamily: DISPLAY_FONT,
        color: '#f0c040'
    },
    BODY: {
        fontSize: '13px',
        fontFamily: BODY_FONT,
        color: '#ccccee'
    },
    BODY_SMALL: {
        fontSize: '11px',
        fontFamily: BODY_FONT,
        color: '#888888'
    },
    BUTTON: {
        fontSize: '14px',
        fontFamily: BODY_FONT,
        color: '#aaaacc'
    },
    BUTTON_HOVER: {
        fontSize: '14px',
        fontFamily: BODY_FONT,
        color: '#ffffff'
    },
    FLAVOR: {
        fontSize: '12px',
        fontFamily: BODY_FONT,
        color: '#666688',
        fontStyle: 'italic'
    },
    FISH_NAME: {
        fontSize: '13px',
        fontFamily: BODY_FONT,
        color: '#88ccff',
        fontStyle: 'bold'
    },
    MONSTER_NAME: {
        fontSize: '13px',
        fontFamily: BODY_FONT,
        color: '#ff9999',
        fontStyle: 'bold'
    },
    GOLD: {
        fontSize: '13px',
        fontFamily: BODY_FONT,
        color: '#f0c040'
    },
    DAMAGE: {
        fontSize: '12px',
        fontFamily: BODY_FONT,
        fontStyle: 'bold'
    },
    VERSION: {
        fontSize: '10px',
        fontFamily: BODY_FONT,
        color: '#555566'
    }
};

export function makeStyle(preset, overrides) {
    return { ...preset, ...overrides };
}
