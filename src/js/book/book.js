$(window).on('load', function(){
	window.appConfig.send('setWindowResizable');
    loadBook();
})

const MAX_FONT_SIZE = 180;
const MIN_FONT_SIZE = 100;

let epubCodeSearch = "";
let book_epub = null;
let book_rendition = null;
let first_time_rendered = true;
let current_section_href = null;
let current_style_settings = null;
let book_saved_pages = null;
let sessionDictionaryLanguage = "en"

var keyListener = function (e) {

    // Left Key
    if ((e.keyCode || e.which) == 37) {
        book_rendition.prev();
    }

    // Right Key
    if ((e.keyCode || e.which) == 39) {
        book_rendition.next();
    }

};

var loadBook = async function(styleSettings = null) {

	// Clear content before rendering again
	$('#book-content-columns').empty()

	// Editable book layout styles
	const bookLayoutStyle = {
		manager: styleSettings?.manager ?? 'default',
		flow: styleSettings?.flow ?? 'paginated',
		width: styleSettings?.width ?? '100%',
	}

    // Toggle layout marker class on wrapper (for spine styling)
    $('#book-content-columns-wrapper').removeClass('layout-paginated layout-scrolled');
    if ((styleSettings?.flow ?? 'paginated') === 'paginated') {
        $('#book-content-columns-wrapper').addClass('layout-paginated');
    } else {
        $('#book-content-columns-wrapper').addClass('layout-scrolled');
    }

    // Get book code by url param
    epubCodeSearch = window.location.search.substring(1).split("=")[1];

	// Get books info and filter it
    var books_json = await window.bookConfig.getBooks();
    var book_infos = await window.bookConfig.searchBook(books_json,epubCodeSearch)

	// Update global variable
	book_saved_pages = book_infos.savedPages;

    // Update last time opened book
    await window.bookConfig.changeBookValue(books_json, epubCodeSearch, "lastTimeOpened", new Date());
    // Display book info 
	await loadBookInfo(book_infos);
    // Display saved pages 
	await loadSavedPages(book_saved_pages);

    // Load epub and rendition 
    book_epub = ePub(await window.appConfig.dirname() + "/epubs/" + epubCodeSearch + "/epub.epub", { openAs: "epub"})
	book_rendition = book_epub.renderTo("book-content-columns", { manager: bookLayoutStyle.manager, flow: bookLayoutStyle.flow, width: bookLayoutStyle.width, height: "100%"});

	// Get back where you left off 
    if (book_infos.lastPageOpened != null){
        book_rendition.display(book_infos.lastPageOpened);
    } else {
        book_rendition.display();
    }

    // Check layout types and display/hide elements 
	if (bookLayoutStyle.flow === 'paginated'){
		$('#previous-chapter-btn, #next-chapter-btn').show()
		$('#previous-chapter-btn').off('click').on('click',async function(){
			book_rendition.prev();
			var current_cfi = book_rendition.currentLocation().start.cfi;
			updateSavePagesButton(book_saved_pages, current_cfi)
			updatePageNumber(current_cfi);
		})
		$('#next-chapter-btn').off('click').on('click', async function () {
			book_rendition.next();
			var current_cfi = book_rendition.currentLocation().start.cfi;
			updateSavePagesButton(book_saved_pages, current_cfi)
			updatePageNumber(current_cfi);
		});
		book_rendition.on("keyup", keyListener);
		document.addEventListener("keyup", keyListener, false);
	} else {
		$('#previous-chapter-btn, #next-chapter-btn').hide()
	}

	// Load on localStorage the epub locations	
    book_epub.ready.then(function () {
        const stored = localStorage.getItem(book_epub.key() + '-locations');
        if (stored) {
            return book_epub.locations.load(stored);
        } else {
            return book_epub.locations.generate(1024); // Generates CFI for every X characters (Characters per/page)
        }
    }).then(function (_) {
        localStorage.setItem(book_epub.key() + '-locations', book_epub.locations.save());
    });

	// Update informations and add events when page rendered 
    book_rendition.on("rendered", async function (section) {
        // Load chapter list in navbar
        if (first_time_rendered) {
            loadChaptersList()
			WebFont.load({
				google: {
					families: ['Inter', 'IBM Plex Serif']
				},
				context: window.frames[0].frameElement.contentWindow,
			})
			first_time_rendered = false
        }
        // Add iframe click event to close all navbar popups
        var iframe = $('iframe').contents();
        iframe.find('body').on('click', function () {
            $('.book-navbar-popup').hide();
            $('#book-action-menu').hide();
        });
        // Apply selection + link styles inside EPUB iframe based on current theme
        injectEpubStyles(current_style_settings?.book?.background_color_style);
		// Spawn action menu on right click if something selected
        iframe.on('contextmenu', function (e) {
            const somethingSelected = $('iframe')[0].contentWindow.getSelection().toString().trim().length > 0
            if(somethingSelected) {
                spawnActionMenu(e)
            }
        });

        const start_cfi = book_rendition.currentLocation().start?.cfi;
        // Update pages
        updatePageNumber(start_cfi)
        // Update save button
        updateSavePagesButton(book_saved_pages, start_cfi);

        // Update global variable with current section href
        current_section_href = section.href;
        // Highlight active chapter in the sidebar
        try {
            $('#book-chapters [data-href]').removeClass('active');
            $('#book-chapters [data-href="' + current_section_href + '"]').addClass('active');
            // Also try exact dataset matching
            $('#book-chapters [data-href]').filter(function () { return $(this).data('href') === current_section_href; }).addClass('active');
        } catch (e) { }
    })

    // Update progress on relocate (page/section change)
    book_rendition.on('relocated', function (location) {
        try {
            const cfi = location?.start?.cfi || book_rendition.currentLocation().start?.cfi;
            updatePageNumber(cfi);
            updateSavePagesButton(book_saved_pages, cfi);
        } catch(e) {}
    });

    // Initialize page tracker interactivity (click to edit, drag to navigate)
    initializePageTrackerInteractivity();

    // Load book styles in navbar
	await loadBookStyleSettings();
}

// React to app-wide theme changes (triggered by theme picker)
window.addEventListener('appThemeChanged', function (e) {
    const theme = e?.detail?.theme;
    if (typeof loadBookStyleSettings === 'function' && typeof book_rendition !== 'undefined' && book_rendition) {
        loadBookStyleSettings(theme);
    }
});

async function updatePageNumber(cfi) {
    var total_pages = book_epub.locations.total;
    var pct = book_epub.locations.percentageFromCfi(cfi) || 0;
    var progress = Math.floor(pct * total_pages);
    $('#current_page_value').text(progress);
    $('#total_page_value').text(total_pages);
    $('#book-info-pages').text(total_pages);
    // Update thin progress bar width
    try { $('#reading-progress-bar').css('width', Math.max(0, Math.min(100, Math.round(pct * 100))) + '%'); } catch(e) {}
}

async function loadBookInfo(info){
    $('#book-info-title').text(info.title ?? 'undefined');
    $('#book-info-author').text(info.author ?? 'undefined');
    $('#book-info-language').text(info.lang ?? 'undefined');
    $('#book-info-year').text(info.bookYear ?? 'undefined');
    $('#book-info-pages').text('undefined');
}
async function loadChaptersList(){
    $('#book-chapters').html(recursiveChapterHtml(book_epub.navigation, 1))
}
var loadDictionary = async function (){
    // get highlighted text from iframe
    const selection_text = $('iframe')[0].contentWindow.getSelection().toString().trim();
    // if text is highlighted
    if (selection_text.length > 0) {
        var finalHtml = '';
        $('#dictionary-popup').html('<div class="circle-loading-logo" style="margin: 0 auto"></div>')
		
		// IGNORE, Future dictionary function supports multiple languages
		/*
        let language_flag_svg = getHtmlSvgFlag(sessionDictionaryLanguage)
        finalHtml += `
                    <div id="language-selection" class="flex-row flex-v-center">
                        <select id="lang-select" onchange="updateDictionaryLanguage(this.value)">
                            <option value="en" ${sessionDictionaryLanguage == "en" && 'selected'}>EN</option>
                            <option value="it" ${sessionDictionaryLanguage == "it" && 'selected'}>IT</option>
                        </select>
                        <div id="lang-flag">
                            ${language_flag_svg}
                        </div>
                    </div></div>`
        // TODO Switch between italian dictinary api and the english one
        switch(sessionDictionaryLanguage) {
            case "en":
                finalHtml += await getHtmlEnglishDictionary(selection_text)
            case "it":
                finalHtml += '<h1 class="main-text text-small text-center"><b>Italian Dictionary API</b> is not available yet.<h1>'
        }
		*/
		
        finalHtml += await getHtmlEnglishDictionary(selection_text)

        $('#dictionary-popup').html(finalHtml);
    } else {
        // No selection text
        $('#dictionary-popup').html('<h1 class="main-text text-sb" style="text-align: center; font-size: 14px;">Highlight some text to know his definition!</h1>')
    }
}

async function getHtmlEnglishDictionary(selection_text){
    let finalHtml = ''
    const multiple_definitions = await getDictionaryWordDefinitions(selection_text)
    // if got any results match
    if (multiple_definitions.length > 0) {
        for (const definition of multiple_definitions) {
            for (const meaning of definition.meanings) {

                var audioObject = await getAudioFromPhonetics(definition.phonetics);

                var audioButtonHtml = audioObject?.hasOwnProperty('audio') ? `
                    <div class="flex-all-centered dictionary-audio-button cursor-pointer" onclick="$(this).children('audio').get(0).play()">
                            <audio hidden class="dictionary-audio-input">
                                <source src="${audioObject.audio}" type="audio/mp3">
                            </audio>
                            <svg xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink" 
                                xmlns:svgjs="http://svgjs.com/svgjs" width="15" height="15" x="0" y="0" viewBox="0 0 512 512" 
                                style="enable-background:new 0 0 512 512" xml:space="preserve" class="">
                            <g>
                                <path xmlns="http://www.w3.org/2000/svg" d="m36.17 325.18h18.44a59.94 59.94 0 0 1 41.13 16.11c27.94 
                                26.48 55.26 52.93 80.57 79.31 15.19 15.79 39.15 18.35 58.54 5.78 20.34-13.24 36.12-34.53 40.22-59.08 
                                3.84-23.4 7.45-55.57 7.49-99.61s-3.64-76.2-7.47-99.61c-4.13-24.67-20-46.06-40.54-59.28-19.25-12.37-42.91-10.07-58.13
                                5.36-25 25.4-51.94 50.86-79.5 76.36a59.91 59.91 0 0 1 -40.56 15.62h-20.06c-19.22 0-35.57 14.63-36 32.67s-.4 35.8-.07
                                53.69c.36 18.05 16.7 32.68 35.94 32.68z"></path>
                                <path xmlns="http://www.w3.org/2000/svg" d="m409.25 261.1a272 272 0 0 0 -8.56-68.9 228.86 228.86 0 0 0 
                                -19.15-49.45c-14-26.38-28.47-39.92-30.07-41.37a25.56 25.56 0 0 0 -34.56 37.67c2.13 2 41.22 40.58 41.22 
                                122.05a220.4 220.4 0 0 1 -6.77 55.39 176.71 176.71 0 0 1 -14.61 38.07c-9.57 18.07-19.18 27.44-19.75 28.06a25.56 
                                25.56 0 0 0 34.4 37.81c1.6-1.44 16.08-14.88 30.14-41.18a226.73 226.73 0 0 0 19.18-49.32 271.72 271.72 0 0 0 8.53-68.83z"></path>
                                <path xmlns="http://www.w3.org/2000/svg" d="m500.12 165.48a315.72 315.72 0 0 0 
                                -26.45-68.32c-19.19-36.07-38.54-54.24-40.67-56.16a25.56 25.56 0 0 0 -34.56 37.67c.57.54 
                                15.59 15 30.44 43.15a265.35 265.35 0 0 1 21.92 57.08 327.46 327.46 0 0 1 10.08 82.3 326 326 0 0 1 
                                -10.08 82.17 262.7 262.7 0 0 1 -21.9 56.85c-14.79 27.85-29.74 42.17-30.37 42.77a25.56 25.56 0 0 0 
                                34.35 37.86c2.15-1.94 21.54-20 40.77-55.9a313.81 313.81 0 0 0 26.47-68.12 377.06 377.06 0 0 0 
                                11.88-95.63 378.17 378.17 0 0 0 -11.88-95.72z"></path>
                            </g></svg>
                    </div> ` : '';


                // Upper text word, audio & phonetic
                finalHtml += `<div class="dictionary-definition-box flex-column">
                                        <div class="flex-row flex-v-center" style="padding-top: 10px;"><h1 class="main-text text-sb" style="font-size: 20px;">${definition.word}</h1>
                                        ${audioButtonHtml}
                                        </div>
                                        <div class="flex-row flex-v-center" style="gap: 5px; padding: 10px 0;">
                                        ${definition.phonetic ? "<h2 class='main-text'>" + definition.phonetic + "</h2>" : ""}
                                        <h2 class="main-text">${meaning.partOfSpeech}</h2>
                                </div>`

                // Upper text synonyms
                if (meaning.synonyms.length > 0) {
                    var synonymText = '<h2 class="main-text m-b-10" style="font-size: 14px; opacity: .8;">Synonyms: '
                    for (const [i, synonym] of meaning.synonyms.entries()) {
                        synonymText += '<i>' + synonym + '</i>'
                        if (i < meaning.synonyms.length - 1) { synonymText += ', ' }
                    }
                    synonymText += '</h2>'
                    finalHtml += synonymText
                }
                // Closing Upper Text
                finalHtml += '<div class="horizontal-divider-05 m-t-10 m-b-10 bg-black"></div>'
                // Definitions list
                finalHtml += '<ol style="padding: 0;list-style-position: inside;">'
                for (const meaning_definition of meaning.definitions) {
                    finalHtml += `<li class="main-text m-t-10">${meaning_definition.definition}</li>`
                }
                finalHtml += '</ol>'
                // Closing dictionary-definition-box
                finalHtml += `</div>`
            }
        }
    } else {
        // No match text
        finalHtml += `<div class="dictionary-definition-box flex-column"><h1 class="main-text text-sb" style="font-size: 20px; padding-top: 10px;">${multiple_definitions.title}</h1><div class="horizontal-divider-05 m-t-10 m-b-10 bg-black"></div><h2 class="main-text">${multiple_definitions.message}<br><br>Rembember to search for <u>only one word at a time</u></h2></div>`;
    }
    return finalHtml
}
function getAudioFromPhonetics(phonetics){
    return phonetics.find(item => { return item.audio != '' }) ?? null

}
function spawnActionMenu(e) {
    var horizontalPadding = $(window).width() - $('#book-content-columns-wrapper').width()
    var hasOverflowedX = (e.pageX % $('#book-content-columns-wrapper').width() + horizontalPadding + $('#book-action-menu').width()) > $(window).width();
    var x = hasOverflowedX ? (e.pageX % $('#book-content-columns-wrapper').width()) - $('#book-action-menu').width() + 'px' : e.pageX % $('#book-content-columns-wrapper').width() + 'px';
    var y = e.pageY + 20 + 'px';

    $('#book-action-menu').css({ 'display': 'block','margin-left': x ,'margin-top': y});
}
function recursiveChapterHtml(array,level) {
    var finalHtml = '<div class="p-l-10">';
    array.forEach((item) => {
        var op = item.label ? "" : "op-5";
        var bold = level == 1 ? 'text-sb' : '';
        finalHtml += `<h1 class="main-text ${op} ${bold}" data-href="${item.href}" onclick="book_rendition.display('${item.href}')">${item.label}</h1>`;
        if (item.subitems.length > 0) {
            finalHtml += recursiveChapterHtml(item.subitems, level+1);
        }
    })

    finalHtml += '</div>';
    return finalHtml;
}
async function loadSavedPages(saved_pages){
    $('#book-saved-pages').html('')
    if (saved_pages.length > 0) {
        saved_pages.forEach((info) => {
            $('#book-saved-pages').append(`
                <div class="book-saved-box cursor-pointer flex-row flex-v-center">
                    <div onclick="handleSavedClick('${info.cfi}')" class="saved-information flex-column">
                        <h1 class="main-text text-sb m-b-5">${info.chapterName}</h1>
                        <h2 class="main-text text-small op-5"><span class="text-sb">${info.date.day}</span> at <span class="text-sb">${info.date.time}</span></h2>
                    </div>
                    <svg onclick="deleteSavedPage('${info.cfi}')" width="22" height="23" viewBox="0 0 22 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fill-rule="evenodd" clip-rule="evenodd"
                            d="M18.4719 2.57066C18.1331 2.21673 17.6563 1.99994 17.139 1.99994H5.84116C4.8455 1.99994 3.99988 2.80297 3.99988 3.84123V17.5538L18.4719 2.57066ZM3.99988 19.6361V20.5469C4.00281 21.8647 5.6124 22.4831 6.52747 21.558L10.8339 17.2528C11.179 16.8928 11.8012 16.8928 12.1463 17.2528L16.4527 21.558C17.3681 22.4834 18.9775 21.8641 18.9803 20.5469V4.12663L3.99988 19.6361Z"
                            />
                        <rect x="-0.00186306" y="-0.71746" width="2.44728" height="27.9745" rx="1.22364"
                            transform="matrix(0.698458 0.715651 -0.694731 0.719269 19.4901 0.79992)" stroke="rgba(0, 0, 0, 0.5)" />
                    </svg>
                </div>
            `)
        })
    } else {
        $('#book-saved-pages').html('<h1 class="main-text text-small op-5" style="text-align: center;">no page saved</h1>');
    }
}
async function handleSavePage() {
    if ($('#book-saved-btn').hasClass("saving")) {
        addSavedPage()
    } else if ($('#book-saved-btn').hasClass("unsaving")) {
        deleteSavedPage(book_rendition.currentLocation().start.cfi)
    }
}
async function handleSavedClick(cfi) {
    book_rendition.display(cfi);
    updateSavePagesButton(book_saved_pages, cfi)
}
async function addSavedPage() {
    let books_json = await window.bookConfig.getBooks();
    const d = new Date();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let book_data = await window.bookConfig.searchBook(books_json, epubCodeSearch);
    let cfi = book_rendition.currentLocation().start.cfi
	let chapterName = await getCurrentChapterLabelByHref(book_epub.navigation.toc, current_section_href)
    let data = {
        chapterName: chapterName,
        cfi: cfi,
        date: {
            day: d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear(),
            time: d.getHours() + ":" + d.getMinutes()
        }
    }
    book_data.savedPages.unshift(data)
    await window.bookConfig.changeBookValue(books_json, epubCodeSearch, "savedPages", book_data.savedPages)
    loadSavedPages(book_data.savedPages)
    book_saved_pages = book_data.savedPages;
    updateSavePagesButton(book_data.savedPages,cfi);
}
async function deleteSavedPage(cfi){
    let books_json = await window.bookConfig.getBooks();
    let data = await window.bookConfig.searchBook(books_json, epubCodeSearch);
    $(data.savedPages).each((index) => {
        if (data.savedPages[index].cfi == cfi) {
            data.savedPages.splice(index, 1);
            return false;
        }
    })

    await window.bookConfig.changeBookValue(books_json, epubCodeSearch, "savedPages", data.savedPages)
    loadSavedPages(data.savedPages)
    book_saved_pages = data.savedPages;
    updateSavePagesButton(data.savedPages, cfi);
}
function updateSavePagesButton(savedPages,cfi){
    var found = savedPages.some(function (item) { return item.cfi == cfi; })
    if (found) {
        $('#book-saved-btn h1').text("Unsave page")
        $('#book-saved-btn').removeClass("saving")
        $('#book-saved-btn').addClass("unsaving")
    } else {
        $('#book-saved-btn h1').text("Save page")
        $('#book-saved-btn').removeClass("unsaving")
        $('#book-saved-btn').addClass("saving")
    }
}
async function loadBookStyleSettings(newStyleColor = null) {
    // Load user settings if not already loaded
    if (!current_style_settings) {
        current_style_settings = await window.bookConfig.getUserSettings();
    }

    // Update style settings if a new style is selected
    if (newStyleColor) {
        current_style_settings.book.background_color_style = newStyleColor;
    }

    // Apply font size and font family
    await book_rendition.themes.fontSize(current_style_settings.book.font_size_percent + "%");
    book_rendition.themes.font(current_style_settings.book.typeface);
    if (current_style_settings.book.typeface.length > 0) {
        $('#typeface-section-text').text(current_style_settings.book.typeface);
    }

    // Apply color styles
    applyThemeStyles(current_style_settings.book.background_color_style);
}

function injectEpubStyles(theme) {
    const isDark = theme === 'dark';
    const selectionColor = isDark ? '#44475A' : '#ADD6FF'; // VSCode-like
    const linkColor = isDark ? '#8BE9FD' : '#1E69DB';
    const linkHover = isDark ? '#FF79C6' : '#1753AD';
    const linkDeco = isDark ? 'rgba(139, 233, 253, .35)' : 'rgba(0,0,0,.35)';
    $('iframe').each(function(){
        const $doc = $(this).contents();
        if (!$doc || !$doc.length) return;
                $doc.find('#epub-theme-injected').remove();
                $doc.find('#epub-theme-script').remove();
                $doc.find('head').append(`
                        <style id="epub-theme-injected">
                                html, body { background: ${isDark ? '#282A36' : '#FFFFFF'} !important; color: ${isDark ? '#F8F8F2' : '#000000'} !important; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
                                p, li, h1, h2, h3, blockquote { line-height: 1.6 !important; }
                                /* selection per-element */
                                p::selection, li::selection, h1::selection, h2::selection, h3::selection, td::selection, th::selection, blockquote::selection, pre::selection, code::selection, span::selection, div::selection { background: ${selectionColor}; color: inherit; }
                                sup::selection, sub::selection { background: transparent; color: inherit; }
                                /* Only style real links (have href). Do not style anchors with only id (toc anchors). */
                                a:not([href]) { text-decoration: none !important; color: inherit !important; cursor: default !important; }
                                a[href], a[href]:visited { color: ${linkColor} !important; text-decoration: underline; text-decoration-color: ${linkDeco}; text-underline-offset: 2px; text-decoration-skip-ink: auto; }
                                a[href]:hover { color: ${linkHover} !important; text-decoration-color: ${linkHover}; }
                                /* Keep superscripts selectable but don't let them trigger big selections */
                                sup, sub { user-select: text !important; -webkit-user-select: text !important; }
                                a sup, a > sup { text-decoration: none; }
                        </style>
                        <script id="epub-theme-script">
                        (function(){
                            // When user clicks/taps on a superscript, avoid accidental large paragraph selection.
                            function handleSupPointer(e){
                                try {
                                    var node = e.target;
                                    while(node && node !== document){
                                        if(node.nodeType===1 && node.tagName && node.tagName.toLowerCase() === 'sup'){
                                            // Defer to after default browser handling
                                            setTimeout(function(){
                                                try{
                                                    var sel = document.getSelection();
                                                    if(!sel) return;
                                                    if(sel.isCollapsed) return;
                                                    var range = sel.getRangeAt(0);
                                                    if(!range) return;
                                                    // If selection started or ended inside this sup, collapse caret after sup
                                                    if(node.contains(range.startContainer) || node.contains(range.endContainer)){
                                                        var r = document.createRange();
                                                        r.setStartAfter(node);
                                                        r.collapse(true);
                                                        sel.removeAllRanges();
                                                        sel.addRange(r);
                                                    }
                                                }catch(e){}
                                            }, 0);
                                            break;
                                        }
                                        node = node.parentNode;
                                    }
                                } catch(e){}
                            }
                            document.addEventListener('mousedown', handleSupPointer, true);
                            document.addEventListener('touchstart', handleSupPointer, true);
                        })();
                        </script>
                `);
    });
}

// Helper function to apply theme styles
function applyThemeStyles(theme) {
    const backgroundElements = $('#book-container, #main-navbar, .book-navbar-popup, #typeface-option, #typeface-section, #book-action-menu, .dictionary-audio-button, #currentPagesContainer');
    const iconElements = $('#rail-chapters-btn, #rail-info-btn, #rail-save-btn, #show-reading-settings, #libraryNavBtn');
    const textElements = $('#currentPages h1');

    // Get the previous and next chapter or page buttons
    const previousChapterBtn = $('#previous-chapter-btn g path');
    const nextChapterBtn = $('#next-chapter-btn g path');

    // Get the close and minimize app buttons
    const closeAppBtn = $('#close-app-icon');
    const resizeAppBtn = $('#resize-minimize-app-icon path');
    const maximizeAppBtn = $('#resize-maximize-app-icon rect');
    const minimizeAppBtn = $('#minimize-app-icon');

    // Reading settings
    const readingSettingsSpan = $('#reading-settings span');
    const readingSettingsH1 = $('#reading-settings h1');
    const verticalDivider = $('.vertical-divider-05');
    const horizontalDivider = $('.horizontal-divider-05');
    const typefaceSectionSVG = $('#typeface-section svg path');
    const selectFontFamily = $('#typeface-option');

    // Book infos
    const bookInfoH1 = $('#book-info h1')
    const bookInfoSpan = $('#book-info span')

    // Book chapters
    const bookChaptersH1 = $('#book-chapters h1')

    // Book saved pages
    const bookSavedPagesH1 = $('#book-saved-pages h1')
    const bookSavedPagesH2 = $('#book-saved-pages h2')
    const bookSaveButton = $('.book-saved-box svg')
    const bookUnsaveButton = $('#book-saved-btn.unsaving')

    // Dictionary popup, isn't working yet
    const dictionaryPopupH1 = $('#dictionary-popup h1')
    const dictionaryPopupH2 = $('#dictionary-popup h2')
    const dictionaryPopupOlLi = $('#dictionary-popup ol li')

    // Reset classes
    backgroundElements.removeClass('page-color-style-brown-bg page-color-style-dark-bg');
    $('#book-content-columns-wrapper').removeClass('spine-visible');
    iconElements.removeClass('page-color-style-brown-color page-color-style-dark-color');
    textElements.css('color', '');

    previousChapterBtn.css('fill', 'black');
    nextChapterBtn.css('fill', 'black');
    
    closeAppBtn.css('stroke', 'black');
    resizeAppBtn.css('fill', 'black');
    maximizeAppBtn.css('stroke', 'black');
    minimizeAppBtn.css('stroke', 'black');

    readingSettingsSpan.css('color', '');
    readingSettingsH1.css('color', '');
    verticalDivider.css('background-color', 'black');
    horizontalDivider.css('background-color', 'black');
    typefaceSectionSVG.css('fill', 'black');
    selectFontFamily.css('background-color', 'white');

    bookInfoH1.css('color', 'black')
    bookInfoSpan.css('color', 'black')

    bookChaptersH1.css('color', 'black')

    bookSavedPagesH1.css('color', 'black')
    bookSavedPagesH2.css('color', 'black')
    bookSaveButton.css('fill', 'black')
    bookUnsaveButton.css('background-color', '#E3B230')

    /*dictionaryPopupH1.css('color', 'black')
    dictionaryPopupH2.css('color', 'black')
    dictionaryPopupOlLi.css('color', 'black')*/
    // Apply theme-specific styles
    switch (theme) {
        case "brown":
            // Register and select a theme for immediate application
            book_rendition.themes.register('brown-ui', { body: { 'color': '#5B4636', 'background': '#F8F1E2' }, a: { 'color': '#1E69DB' } });
            book_rendition.themes.select('brown-ui');
            backgroundElements.addClass('page-color-style-brown-bg');
            iconElements.addClass('page-color-style-brown-color');
            textElements.css('color', '#5B4636');

            previousChapterBtn.css('fill', 'black');
            nextChapterBtn.css('fill', 'black');

            closeAppBtn.css('stroke', '#5B4636');
            resizeAppBtn.css('fill', '#5B4636');
            maximizeAppBtn.css('stroke', '#5B4636');
            minimizeAppBtn.css('stroke', '#5B4636');

            readingSettingsSpan.css('color', '#5B4636');
            readingSettingsH1.css('color', '#5B4636');
            verticalDivider.css('background-color', '#5B4636');
            horizontalDivider.css('background-color', '#5B4636');
            typefaceSectionSVG.css('fill', '#5B4636');
            selectFontFamily.css({ 'background-color': '#F8F1E2', 'color': '#5B4636' });

            bookInfoH1.css('color', '#5B4636')
            bookInfoSpan.css('color', '#5B4636')

            bookChaptersH1.css('color', '#5B4636')

            bookSavedPagesH1.css('color', '#5B4636')
            bookSavedPagesH2.css('color', '#5B4636')
            bookSaveButton.css('fill', '#5B4636')
            bookUnsaveButton.css('background-color', '#5B4636')

            /*dictionaryPopupH1.css('color', '#5B4636')
            dictionaryPopupH2.css('color', '#5B4636')
            dictionaryPopupOlLi.css('color', '#5B4636')*/
            break;
        case "dark":
            book_rendition.themes.register('dracula', {
                body: { 'color': '#F8F8F2', 'background': '#282A36' },
                a: { 'color': '#8BE9FD', 'text-decoration': 'underline', 'text-underline-offset': '2px' }
            });
            book_rendition.themes.select('dracula');
            backgroundElements.addClass('page-color-style-dark-bg');
            $('#book-content-columns-wrapper').addClass('spine-visible');
            iconElements.addClass('page-color-style-dark-color');
            textElements.css('color', '#F8F8F2');

            previousChapterBtn.css('fill', '#F8F8F2');
            nextChapterBtn.css('fill', '#F8F8F2');

            closeAppBtn.css('stroke', '#F8F8F2');
            resizeAppBtn.css('fill', '#F8F8F2');
            maximizeAppBtn.css('stroke', '#F8F8F2');
            minimizeAppBtn.css('stroke', '#F8F8F2');

            readingSettingsSpan.css('color', '#F8F8F2');
            readingSettingsH1.css('color', '#F8F8F2');
            verticalDivider.css('background-color', '#44475A');
            horizontalDivider.css('background-color', '#44475A');
            typefaceSectionSVG.css('fill', '#F8F8F2');
            selectFontFamily.css({ 'background-color': '#343746', 'color': '#F8F8F2' });
            
            bookInfoH1.css('color', '#F8F8F2')
            bookInfoSpan.css('color', '#F8F8F2')

            bookChaptersH1.css('color', '#F8F8F2')

            bookSavedPagesH1.css('color', '#F8F8F2')
            bookSavedPagesH2.css('color', '#F8F8F2')
            bookSaveButton.css('fill', '#F8F8F2')
            bookUnsaveButton.css({ 'border': '1px solid #F8F8F2', 'background-color': '#282A36' })

            // Inject selection + link style in current iframe
            injectEpubStyles('dark');

            /*dictionaryPopupH1.css('color', 'white')
            dictionaryPopupH2.css('color', 'white')
            dictionaryPopupOlLi.css('color', 'white')*/
            break;
        default: // Default to light theme
            book_rendition.themes.register('light-ui', {
                body: { 'color': 'black', 'background': '#FFFFFF' },
                a: { 'color': '#1E69DB', 'text-decoration': 'underline', 'text-underline-offset': '2px' }
            });
            book_rendition.themes.select('light-ui');
            textElements.css('color', 'black');
            // Ensure iframe link + selection revert to light
            injectEpubStyles('light');
    }
}


var checkNavbarFontSizeOpacity = function () {
	if(current_style_settings){
		$('#settings-decrease-font-size').removeClass('op-5');
		$('#settings-increase-font-size').removeClass('op-5');
		if (current_style_settings.book.font_size_percent == MAX_FONT_SIZE) {
			$('#settings-increase-font-size').addClass('op-5');

		} else if (current_style_settings.book.font_size_percent == MIN_FONT_SIZE) {
			$('#settings-decrease-font-size').addClass('op-5');
		}
	}
}
var saveBeforeClose = async function() {
    saveBookPageBeforeClose();
    window.bookConfig.saveUserSettings(current_style_settings)
}
var saveBookPageBeforeClose = async function(){
    if (book_rendition) {
        let location = book_rendition.currentLocation();
        let cfiString = location.start.cfi;
        var books_json = await window.bookConfig.getBooks();
        await window.bookConfig.changeBookValue(books_json, epubCodeSearch, "lastPageOpened", cfiString)
    }
}

var getCurrentChapterLabelByHref = async function(navigationToc,chapterHref){
    chapter_title = null;
    for(const books of navigationToc){
        if (books.href.includes(chapterHref)){
            chapter_title = `[${books.label}] Page ${$("#current_page_value").text()}`;
            break;
        } else if (books.subitems.length > 0) {
            var temp_chapter_title = await getCurrentChapterLabelByHref(books.subitems, chapterHref)
            if (temp_chapter_title != null) {
                chapter_title = temp_chapter_title;
                break;
            } else {
                chapter_title = `Page ${$("#current_page_value").text()}`;
            }
        }
    }
    return chapter_title;
}

// Page tracker interactivity: click to edit page number, drag to navigate
function initializePageTrackerInteractivity() {
    const $currentPages = $('#currentPages');
    let isEditing = false;
    let isDragging = false;
    let dragStartY = 0;
    let dragStartPercentage = 0;

    // Click handler: switch to edit mode
    $currentPages.on('click', function(e) {
        if (isEditing) return;
        isEditing = true;
        $currentPages.addClass('edit-mode');
        
        const currentPage = parseInt($('#current_page_value').text());
        const totalPages = parseInt($('#total_page_value').text());
        
        // Replace with input field
        const inputHtml = `<input type="number" id="page-number-input" min="1" max="${totalPages}" value="${currentPage}">`;
        $currentPages.html(inputHtml);
        
        const $input = $('#page-number-input');
        $input.focus();
        $input.select();
        
        // Handle enter key to confirm
        $input.on('keydown', function(e) {
            if (e.key === 'Enter') {
                confirmPageJump();
            } else if (e.key === 'Escape') {
                cancelEditMode();
            }
        });
        
        // Handle blur to confirm
        $input.on('blur', function() {
            setTimeout(confirmPageJump, 100);
        });
    });

    function confirmPageJump() {
        if (!isEditing) return;
        
        const newPage = parseInt($('#page-number-input').val());
        const totalPages = parseInt($('#total_page_value').text());
        
        if (isNaN(newPage) || newPage < 1 || newPage > totalPages) {
            cancelEditMode();
            return;
        }
        
        // Calculate percentage and jump to page
        const percentage = (newPage - 1) / totalPages;
        const cfi = book_epub.locations.cfiFromPercentage(percentage);
        
        if (cfi) {
            book_rendition.display(cfi);
        }
        
        isEditing = false;
        // The display() call will trigger 'relocated' which will update updatePageNumber()
    }

    function cancelEditMode() {
        if (!isEditing) return;
        
        // Restore original display
        const currentPage = Math.floor(book_epub.locations.total * book_epub.locations.percentageFromCfi(book_rendition.currentLocation().start.cfi));
        const totalPages = book_epub.locations.total;
        
        $currentPages.html(`<h1 class="main-text"><span id="current_page_value" class="text-sb">${currentPage}</span> of <span id="total_page_value">${totalPages}</span></h1>`);
        $currentPages.removeClass('edit-mode');
        isEditing = false;
    }

    // Drag handler: click and drag to navigate
    $currentPages.on('mousedown', function(e) {
        if (isEditing) return;
        isDragging = true;
        dragStartY = e.clientY;
        dragStartPercentage = book_epub.locations.percentageFromCfi(book_rendition.currentLocation().start.cfi) || 0;
        $currentPages.addClass('dragging');
        e.preventDefault();
    });

    $(document).on('mousemove', function(e) {
        if (!isDragging) return;
        
        const deltaY = e.clientY - dragStartY;
        // Sensitivity: every 5 pixels of drag = 1% of book
        const deltaPercentage = (deltaY / 5) / 100;
        const newPercentage = Math.max(0, Math.min(1, dragStartPercentage + deltaPercentage));
        
        const cfi = book_epub.locations.cfiFromPercentage(newPercentage);
        if (cfi) {
            try {
                book_rendition.display(cfi);
            } catch(e) {}
        }
    });

    $(document).on('mouseup', function(e) {
        if (isDragging) {
            isDragging = false;
            $currentPages.removeClass('dragging');
        }
    });
}


