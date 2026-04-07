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
  // ВАЖНО: замените на реальные URL продакшен-окружения. https обязателен.
  var FRONT_URL   = 'http://localhost:5173'
  var BACKEND_URL = 'http://localhost:3101'

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

    self.callbacks = {
      settings: function () { return true },
      bind_actions: function () { return true },
      render: function () { return true },
      destroy: function () {},
      advancedSettings: function () { return true },
      onSave: function () { return true },

      init: function () {
        // Один раз при загрузке — отправляем аватарки в backend
        pushAvatars()
        return true
      },

      /**
       * Точка входа для location: advanced (пункт левого меню).
       */
      advanced: function () {
        // На всякий случай — повторная отправка (вдруг init не успел)
        pushAvatars()

        var $area = $('#work-area-' + self.get_settings().widget_code)
        if (!$area.length) $area = $('#work-area')
        $area.html(
          '<iframe ' +
          '  src="' + FRONT_URL + '"' +
          '  style="width:100%;height:calc(100vh - 80px);border:0;background:#fafafa"' +
          '  allow="clipboard-read; clipboard-write"' +
          '></iframe>'
        )
        return true
      },
    }

    return self
  }

  return CustomWidget
})
