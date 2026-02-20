window.DungeonFisherApp = (() => {
    const container = document.getElementById('dungeon');
    let iframe = null;

    function start() {
        if (iframe) return;
        iframe = document.createElement('iframe');
        iframe.src = 'dungeon-fisher/index.html';
        iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('title', 'Dungeon Fisher');
        container.appendChild(iframe);
    }

    function stop() {
        if (iframe) {
            iframe.remove();
            iframe = null;
        }
    }

    return { start, stop };
})();
