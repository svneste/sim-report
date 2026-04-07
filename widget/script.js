/* global define, AMOCRM */
/**
 * amoCRM widget — тонкая обёртка, открывающая SPA в iframe.
 *
 * Дополнительно при инициализации читает аватарки сотрудников из
 * AMOCRM.constant('account').users и отправляет их в наш backend
 * (публичный REST API amoCRM аватарки не отдаёт, это единственный
 * стабильный способ их получить).
 */
define(['jquery'], function ($) {
  // ==== Конфиг ====
  // Прод: фронт и backend живут за одним Caddy на одном домене.
  // Фронт отдаётся nginx-ом, /api/* проксируется в Fastify backend.
  var FRONT_URL   = 'https://account.mskmegafon.ru'
  var BACKEND_URL = 'https://account.mskmegafon.ru'

  /**
   * Извлекает map { userId: avatarUrl } из AMOCRM.constant('account').
   * Структура amoCRM-объекта меняется между версиями, поэтому мы пробуем
   * несколько известных полей и не падаем, если что-то отсутствует.
   */
  function collectAvatars() {
    var out = {}
    try {
      if (typeof AMOCRM === 'undefined' || !AMOCRM.constant) return out
      var account = AMOCRM.constant('account')
      if (!account || !account.users) return out

      // users может быть массивом или объектом-словарём (id → user)
      var list = []
      if (Array.isArray(account.users)) list = account.users
      else list = Object.keys(account.users).map(function (k) { return account.users[k] })

      for (var i = 0; i < list.length; i++) {
        var u = list[i] || {}
        var id = u.id || u.user_id
        if (!id) continue

        // Известные имена полей в разных версиях amoCRM web client
        var url = u.pic_uri || u._pic || u.pic || u.avatar || (u._links && (u._links.icon || u._links.avatar))
        if (typeof url === 'object' && url) url = url.href || url.src

        if (url && typeof url === 'string') {
          // Относительные пути приводим к абсолютным от текущего домена amoCRM
          if (url.indexOf('//') === 0) url = window.location.protocol + url
          else if (url.indexOf('/') === 0) url = window.location.protocol + '//' + window.location.host + url
          out[String(id)] = url
        }
      }
    } catch (e) {
      // ничего не делаем, аватарки опциональны
      if (window.console) console.warn('[sim_report] avatars collect failed', e)
    }
    return out
  }

  function pushAvatars() {
    var avatars = collectAvatars()
    var ids = Object.keys(avatars)
    if (!ids.length) return
    try {
      $.ajax({
        url:         BACKEND_URL + '/api/users/avatars',
        method:      'POST',
        contentType: 'application/json',
        data:        JSON.stringify({ avatars: avatars }),
        timeout:     5000,
      })
    } catch (e) {
      if (window.console) console.warn('[sim_report] avatars push failed', e)
    }
  }

  var CustomWidget = function () {
    var self = this

    /**
     * Рендер iframe в области расширенных настроек виджета.
     * Вызывается из нескольких callback-ов, т.к. amoCRM в разных версиях
     * вызывает то advanced, то advancedSettings.
     */
    function renderIframe() {
      try {
        var code = (self.get_settings && self.get_settings().widget_code) || 'sim'
        // Перебираем все известные контейнеры, в которые amoCRM сажает виджеты:
        // - #work-area-<code>     — advanced_settings
        // - #work-area            — fallback
        // - .widget-page__content / [data-id="widget_page"] — left menu (widget_page)
        var $area = $('#work-area-' + code)
        if (!$area.length) $area = $('#work-area')
        if (!$area.length) $area = $('.widget-page__content').first()
        if (!$area.length) $area = $('[data-id="widget_page"]').first()
        if (!$area.length) $area = $('.widget-settings__work-area').first()
        if (!$area.length) $area = $('#page_holder')
        if (!$area.length) {
          if (window.console) console.warn('[sim_report] work-area not found, dumping body classes:', document.body.className)
          return
        }
        if ($area.find('iframe[data-sim-report]').length) return
        $area.html(
          '<iframe data-sim-report="1" ' +
          '  src="' + FRONT_URL + '"' +
          '  style="width:100%;height:calc(100vh - 60px);min-height:600px;border:0;background:#fafafa;display:block"' +
          '  allow="clipboard-read; clipboard-write"' +
          '></iframe>'
        )
      } catch (e) {
        if (window.console) console.warn('[sim_report] renderIframe failed', e)
      }
    }

    self.callbacks = {
      settings: function () { return true },
      bind_actions: function () { return true },
      render: function () { return true },
      destroy: function () {},
      onSave: function () { return true },

      init: function () {
        // Один раз при загрузке — отправляем аватарки в backend
        pushAvatars()
        return true
      },

      /**
       * Точка входа для location: advanced_settings.
       * amoCRM в зависимости от версии зовёт либо advanced, либо advancedSettings.
       */
      advancedSettings: function () {
        if (window.console) console.log('[sim_report] advancedSettings called')
        pushAvatars()
        renderIframe()
        return true
      },

      advanced: function () {
        if (window.console) console.log('[sim_report] advanced called')
        pushAvatars()
        renderIframe()
        return true
      },

      /**
       * Точка входа для location: widget_page (пункт левого меню).
       * amoCRM вызывает этот callback при клике на наш пункт в левом меню,
       * параметры: { location: 'widget_page', item_code: 'sim_report', ... }
       */
      initMenuPage: function (params) {
        if (window.console) console.log('[sim_report] initMenuPage called', params)
        pushAvatars()
        renderIframe()
        return true
      },
    }

    return self
  }

  return CustomWidget
})
