$(window).on('load', function(){
    // Track which panel is currently shown in the sidebar ("chapters", "info", "save", or null)
    let currentSidebarPanel = null;
    // Position sidebar below the navbar and size its scrollable area
    function adjustSidebarPosition() {
        try {
            const $sidebar = $('#book-sidebar');
            const $rail = $('#book-rail');
            if (!$sidebar.length) return;
            const $bookWrapper = $('#book-content-columns-wrapper');
            const $container = $('#book-container');
            const headerH = $sidebar.find('.book-sidebar-header').outerHeight() || 0;
            if ($bookWrapper.length && $container.length) {
                const rect = $bookWrapper[0].getBoundingClientRect();
                // Use viewport coordinates (rect.top) since rail/sidebar are fixed-positioned
                const top = Math.max(rect.top, 0);
                const h = Math.max(rect.height, 0);
                $sidebar.css({ top: top + 'px', height: h + 'px' });
                if ($rail.length) $rail.css({ top: top + 'px', height: h + 'px' });
                $sidebar.find('.book-sidebar-content, .sidebar-section').css({ 'max-height': Math.max(h - headerH, 0) + 'px', 'overflow-y': 'auto', '-webkit-overflow-scrolling': 'touch' });
            } else {
                // fallback: occupy full container height
                $sidebar.css({ top: '0px', height: '100%' });
                if ($rail.length) $rail.css({ top: '0px', height: '100%' });
                const sidebarH = $sidebar.height() || 0;
                $sidebar.find('.book-sidebar-content, .sidebar-section').css({ 'max-height': Math.max(sidebarH - headerH, 0) + 'px', 'overflow-y': 'auto', '-webkit-overflow-scrolling': 'touch' });
            }
        } catch (e) { }
    }

    // Keep sidebar aligned on resize
    $(window).on('resize', function(){
        adjustSidebarPosition();
    });
    // Adjust immediately on load
    setTimeout(adjustSidebarPosition, 50);
    $("body").on('click',function(e){
        // iframe click doesn't work, need to be added/fixed
        if (!$(e.target).hasClass('book-navbar-popup-open') && // Check clicking popup icon
            !$(e.target).parents('.book-navbar-popup-open').length &&  // Check clicking something inside popup icon
            $(e.target).closest($('.book-navbar-popup')).length == 0 && // Check clicking inside of popup
            $(e.target).closest($('#book-action-menu')).length == 0) {  // Check clicking inside the action menu
            $('.book-navbar-popup').hide();
            $('#book-action-menu').hide();
        }
    });
    $('#show-reading-settings').on('click', function(){
        $('.book-navbar-popup:not(#reading-settings)').hide();
        $('#reading-settings').toggle();
        $('#book-action-menu').hide();
    })
    // Rail controls: toggle or swap sidebar panels
    function setRailActive(panel) {
        $('#book-rail .rail-btn').removeClass('active');
        if (panel === 'chapters') $('#rail-chapters-btn').addClass('active');
        if (panel === 'info') $('#rail-info-btn').addClass('active');
        if (panel === 'save') $('#rail-save-btn').addClass('active');
        if (panel === 'dictionary') $('#rail-dict-btn').addClass('active');
    }
    function openSidebarPanel(panel) {
        const $sidebar = $('#book-sidebar');
        // Show the requested section
        $('.sidebar-section').hide();
        // toggle chapter list visibility explicitly
        $('#book-chapters').toggle(panel === 'chapters');
        if (panel === 'info') { $('#book-info').show(); }
        if (panel === 'save') { $('#book-saved').show(); }
        if (panel === 'dictionary') { $('#dictionary-popup').show(); }
        // Expand the sidebar if collapsed
        if ($sidebar.hasClass('collapsed')) {
            $sidebar.removeClass('collapsed');
        }
        $sidebar.attr('aria-hidden', false);
        // Update header title based on active panel
        const titleMap = { chapters: 'Chapters', info: 'Book Info', save: 'Save Page', dictionary: 'Dictionary' };
        $('#book-sidebar-title').text(titleMap[panel] || '');
        setRailActive(panel);
        currentSidebarPanel = panel;
        $('body').addClass('book-sidebar-open');
        setTimeout(adjustSidebarPosition, 50);
        try { localStorage.setItem('book-sidebar-collapsed', '0'); } catch (e) {}
    }
    function collapseSidebar() {
        const $sidebar = $('#book-sidebar');
        $sidebar.addClass('collapsed').attr('aria-hidden', true);
        setRailActive(null);
        currentSidebarPanel = null;
        $('body').removeClass('book-sidebar-open');
        $('#book-sidebar-title').text('');
        setTimeout(adjustSidebarPosition, 50);
        try { localStorage.setItem('book-sidebar-collapsed', '1'); } catch (e) {}
    }
    function togglePanel(panel) {
        const $sidebar = $('#book-sidebar');
        const isOpen = !$sidebar.hasClass('collapsed');
        if (isOpen && currentSidebarPanel === panel) {
            collapseSidebar();
        } else {
            openSidebarPanel(panel);
        }
    }
    $('#rail-chapters-btn').on('click', function(){ togglePanel('chapters'); });
    $('#rail-info-btn').on('click', function(){ togglePanel('info'); });
    $('#rail-dict-btn').on('click', function(){ togglePanel('dictionary'); try { setTimeout(loadDictionary, 20); } catch(e){} });
    $('#rail-save-btn').on('click', function(){ togglePanel('save'); try { if (typeof updateSavePagesButton === 'function' && typeof book_rendition !== 'undefined') { updateSavePagesButton(window.book_saved_pages || [], book_rendition.currentLocation().start.cfi); } } catch(e){} });
    $('#show-dictionary-popup, #action-menu-show-dictionary').on('click', function (e) {
        $('.book-navbar-popup:not(#dictionary-popup)').hide();
        $('#book-action-menu').hide();
        openSidebarPanel('dictionary');
        // load selection
        loadDictionary();
    })
    // old top-nav save/info popup handlers removed — controls now live in the sidebar via rail
    $('#libraryNavBtn').on('click', async function(){
		window.appConfig.send('unsetWindowResizable');
        window.appConfig.send('unmaximizeApp');
    })
    $('#settings-increase-font-size').on('click', function(){
		$(this).addClass('settings-font-click-animation')
        if (current_style_settings.book.font_size_percent < MAX_FONT_SIZE) current_style_settings.book.font_size_percent += 2
        checkNavbarFontSizeOpacity();
        book_rendition.themes.fontSize(current_style_settings.book.font_size_percent + "%");
    })
    $('#settings-decrease-font-size').on('click', function () {   
		$(this).addClass('settings-font-click-animation')
        if (current_style_settings.book.font_size_percent > MIN_FONT_SIZE) current_style_settings.book.font_size_percent -= 2
        checkNavbarFontSizeOpacity();
        book_rendition.themes.fontSize(current_style_settings.book.font_size_percent + "%");
    })
    // Removed header chevron/toggle; rail icons control open/close

    // Restore sidebar state from localStorage
    try {
        const state = localStorage.getItem('book-sidebar-collapsed');
        if (state === '1') {
            $('#book-sidebar').addClass('collapsed');
            $('#book-sidebar').attr('aria-hidden', true);
            setRailActive(null);
            $('body').removeClass('book-sidebar-open');
        } else if (state === '0') {
            $('#book-sidebar').removeClass('collapsed');
            $('#book-sidebar').attr('aria-hidden', false);
            $('body').addClass('book-sidebar-open');
        }
    } catch(e) {}
    // ensure sidebar stays aligned after restoring state
    setTimeout(function(){ adjustSidebarPosition(); }, 50);
});

function loadLayoutHandler(layout) {
	$('.loadLayoutIcon').removeClass('active')
	switch(layout){
		case 'scrolled':
			loadBook({manager: 'continuous', flow: 'scrolled', width: '65%'});
			$('#loadLayoutScrolled').addClass('active')
			break;
		default:

			$('#loadLayoutDefault').addClass('active')
			loadBook()
			break;
	}
}

function handleTypeFaceSelection() {
    $('#typeface-option').toggle()
}
function handleChangeFont(fontText,fontValue){
    $('#typeface-section-text').text(fontText);
    book_rendition.themes.font(fontValue);
    current_style_settings.book.typeface = fontValue; 
}
