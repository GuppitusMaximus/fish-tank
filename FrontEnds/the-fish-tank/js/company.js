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

(function () {
    var video = document.getElementById('gameplay-video');
    var choices = document.getElementById('gameplay-choices');
    var caption = document.getElementById('gameplay-caption');
    if (!video || !choices || !caption) return;

    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var buttons = Array.from(choices.querySelectorAll('button'));
    var resumeWhenVisible = document.hidden && !reducedMotion.matches;

    function playPreview() {
        if (!reducedMotion.matches && !document.hidden) {
            video.play().catch(function () {});
        }
    }

    buttons.forEach(function (button) {
        button.addEventListener('click', function () {
            if (button.getAttribute('aria-pressed') === 'true') return;
            video.pause();
            video.poster = button.dataset.poster;
            video.src = button.dataset.video;
            video.setAttribute('aria-label', button.dataset.title);
            caption.textContent = button.dataset.caption;
            buttons.forEach(function (choice) {
                choice.setAttribute('aria-pressed', String(choice === button));
            });
            video.load();
            playPreview();
        });
    });

    choices.hidden = false;
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            resumeWhenVisible = !video.paused;
            video.pause();
        } else if (resumeWhenVisible) {
            resumeWhenVisible = false;
            playPreview();
        }
    });
    reducedMotion.addEventListener('change', function () {
        if (reducedMotion.matches) {
            resumeWhenVisible = false;
            video.pause();
        }
    });
    playPreview();
})();
