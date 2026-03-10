$(window).on('load', async function(){
  // Apply theme from saved settings and install a small theme-picker in the navbar
  async function applyAppTheme(theme) {
    // Clear previous theme helpers
    $('body, #main-navbar, #book-sidebar').removeClass('page-color-style-dark-bg page-color-style-brown-bg');
    $('.main-text, #minimize-app-icon, #close-app-icon, svg').removeClass('page-color-style-dark-color page-color-style-brown-color');
    $('.vertical-divider-05, .horizontal-divider-05').css('background-color', '');

    if (theme === 'dark') {
      $('body, #main-navbar, #book-sidebar').addClass('page-color-style-dark-bg');
      $('body .main-text, #minimize-app-icon, #close-app-icon').addClass('page-color-style-dark-color');
      $('.vertical-divider-05, .horizontal-divider-05').css('background-color', '#44475A');
      $('#theme-picker-popup').css({ 'background-color': '#2b2e3a', color: '#F8F8F2' });
    } else if (theme === 'brown') {
      // Apply a brown-ish UI accent using existing helper classes where possible
      $('body, #main-navbar, #book-sidebar').addClass('page-color-style-brown-bg');
      $('body .main-text, #minimize-app-icon, #close-app-icon').addClass('page-color-style-brown-color');
      $('.vertical-divider-05, .horizontal-divider-05').css('background-color', '#5B4636');
      $('#theme-picker-popup').css({ 'background-color': '#F8F1E2', color: '#5B4636' });
    } else {
      // default: ensure any theme classes are removed
      $('#theme-picker-popup').css({ 'background-color': 'white', color: 'black' });
    }

    // Notify other parts of the app (book renderer) about the theme change
    try {
      window.dispatchEvent(new CustomEvent('appThemeChanged', { detail: { theme } }));
    } catch (e) {}
  }

  // Install theme picker into navbar if available
  try {
    const settings = await window.bookConfig.getUserSettings();
    const theme = settings?.book?.background_color_style || 'default';
    await applyAppTheme(theme);

    // Inject a compact theme picker into the right side of the navbar
    const $nav = $('#main-navbar');
    if ($nav && $nav.length) {
      const $right = $nav.children().last();
      if ($right && $right.length) {
        const pickerHtml = `
          <div id="theme-picker" style="position:relative; margin-left:12px">
            <button id="theme-picker-open" class="cursor-pointer" aria-label="Theme picker" style="background:transparent;border:none;display:flex;align-items:center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3C12.5523 3 13 2.55228 13 2V1C13 0.447715 12.5523 0 12 0C11.4477 0 11 0.447715 11 1V2C11 2.55228 11.4477 3 12 3Z" stroke="currentColor" stroke-width="1.2"/><path d="M4.22 4.22C4.61036 3.82963 5.24353 3.82963 5.63389 4.22L6.34 4.92611C6.73036 5.31648 6.73036 5.94965 6.34 6.33901C5.94964 6.72938 5.31647 6.72938 4.9261 6.33901L4.22 5.6329C3.82963 5.24254 3.82963 4.60937 4.22 4.22Z" stroke="currentColor" stroke-width="1.2"/><path d="M20.36 4.22C20.7504 3.82963 21.3835 3.82963 21.7739 4.22C22.1643 4.61036 22.1643 5.24353 21.7739 5.63389L21.0678 6.34C20.6774 6.73036 20.0442 6.73036 19.6539 6.34C19.2635 5.94964 19.2635 5.31647 19.6539 4.9261L20.36 4.22Z" stroke="currentColor" stroke-width="1.2"/><path d="M12 7C14.7614 7 17 9.23858 17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12C7 9.23858 9.23858 7 12 7Z" stroke="currentColor" stroke-width="1.2"/></svg>
            </button>
            <div id="theme-picker-popup" style="position:absolute; right:0; top:36px; display:none; background:white; border-radius:6px; box-shadow:0 6px 20px rgba(0,0,0,.12); overflow:hidden; z-index:100; min-width:140px;">
              <div class="theme-picker-option" data-theme="default" style="padding:10px; cursor:pointer;">Default</div>
              <div class="theme-picker-option" data-theme="brown" style="padding:10px; cursor:pointer;">Brown</div>
              <div class="theme-picker-option" data-theme="dark" style="padding:10px; cursor:pointer;">Dark</div>
            </div>
          </div>
        `;
        $right.append(pickerHtml);

        // handlers
        $(document).on('click', '#theme-picker-open', function(e){
          e.stopPropagation();
          $('#theme-picker-popup').toggle();
        });
        $(document).on('click', '.theme-picker-option', async function(e){
          const newTheme = $(this).data('theme');
          try {
            const settings = await window.bookConfig.getUserSettings();
            settings.book = settings.book || {};
            settings.book.background_color_style = newTheme;
            await window.bookConfig.saveUserSettings(settings);
          } catch (err) {}
          await applyAppTheme(newTheme);
          $('#theme-picker-popup').hide();
        });
        // close on outside click
        $(document).on('click', function(e){
          if (!$(e.target).closest('#theme-picker').length) {
            $('#theme-picker-popup').hide();
          }
        });
      }
    }
  } catch (e) {
    // Fail silently if settings are not available here
  }

  // Expose applyAppTheme for other modules
  window.applyAppTheme = applyAppTheme;
});