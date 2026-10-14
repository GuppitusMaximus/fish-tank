// Preserve bookmarks to views that now belong to the project hub.
(function () {
    function redirectHubBookmark() {
        var view = window.location.hash.slice(1).split('/')[0];
        if (['home', 'weather', 'fishtank', 'battle', 'fighter', 'fathomfall', 'mocks'].includes(view)) {
            window.location.replace('/hub/' + window.location.hash);
        }
    }
    window.addEventListener('hashchange', redirectHubBookmark);
    redirectHubBookmark();
})();
