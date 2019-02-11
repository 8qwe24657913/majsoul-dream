(function () {
  // 初始化 hook 部分
  const [hookReq, hookRes] = (function(){
    const hookMaps = {}
    for (let key of ['Lobby', 'MJ']) {
      hookMaps[key] = new Map()
      const origFunc = window.app.NetAgent['sendReq2' + key]
      window.app.NetAgent['sendReq2' + key] = function(socket, command, info, callback) {
        if (!hookMaps[key].has(command)) return origFunc.call(this, socket, command, info, callback)
        try {
          const send = hookMaps[key].get(command)(info, callback)
          if (!send) return;
          [info, callback] = send
        } catch(e) {
          //debugger
          console.warn(e)
        }
        return origFunc.call(this, socket, command, info, callback)
      }
    }
    function hookReq(socket, commands, hook) {
      if (!Array.isArray(commands)) commands = [commands]
      for (let command of commands) {
        if (hookMaps[socket].has(command)) throw new Error(`Can't hook ${command} twice.`)
        hookMaps[socket].set(command, hook)
      }
    }
    function hookRes(socket, commands, hook) {
      hookReq(socket, commands, (info, callback) => [info, function (err, res) {
        try {
          res = err || res.error ? res : hook(res)
        } catch(e){
          //debugger
          console.warn(e)
        }
        return callback.call(this, err, res)
      }])
    }
    return [hookReq, hookRes]
  }())
  // 设置
  const config = localStorage.getItem('8q_config') ? JSON.parse(localStorage.getItem('8q_config')) : {
    title: 600016,
    main_character_id: 200001,
    skin: {
      200001: 400102
    },
    views: {
      200001: []
    },
    common_view: [],
  }
  function saveConfig() {
    localStorage.setItem('8q_config', JSON.stringify(config))
  }
  // 记录 account_id acturalTitle，换当前皮肤、称号
  let account_id, acturalTitle
  hookRes('Lobby', ['login', 'oauth2Login'], function (resLogin) {
    account_id = resLogin.account_id // or resLogin.account.account_id
    resLogin.account.avatar_id = config.skin[config.main_character_id]
    acturalTitle = resLogin.account.title
    resLogin.account.title = config.title
    return resLogin
  })
  // 记录 characterMap skinSet acturalCharacter，开启宿舍全角色羁绊皮肤额外表情
  let characterMap = new Map(), skinSet, acturalCharacter
  hookRes('Lobby', 'fetchCharacterInfo', function (charInfo) {
    for (let char of charInfo.characters) {
      if (!char.views) char.views = []
      characterMap.set(char.charid, char)
    }
    skinSet = new Set(charInfo.skins)
    charInfo.characters = []
    charInfo.skins = []
    let configChanged = false
    for (let char of window.cfg.item_definition.character.rows_) {
      if (!config.skin[char.id]) {
        configChanged = true
        config.skin[char.id] = char.full_fetter_skin || char.init_skin
      }
      charInfo.characters.push({
        charid: char.id,
        level: 5,
        exp: 0,
        views: (config.views[char.id] || (characterMap.has(char.id) ? characterMap.get(char.id).views : [])).slice(),
        skin: config.skin[char.id],
        is_upgraded: true,
        extra_emoji: window.cfg.character.emoji.groups_[char.id].map(emoji => emoji.sub_id),
      })
      charInfo.skins.push(char.init_skin)
      if (char.full_fetter_skin) charInfo.skins.push(char.full_fetter_skin)
    }
    if (configChanged) saveConfig()
    acturalCharacter = charInfo.main_character_id
    charInfo.main_character_id = config.main_character_id
    return charInfo
  })
  // 账户信息
  hookRes('Lobby', 'fetchAccountInfo', function (accountInfo) {
    accountInfo.account.avatar_id = config.skin[config.main_character_id]
    return accountInfo
  })
  // 开启游戏内皮肤装扮
  hookRes('MJ', 'authGame', function (gameInfo) {
    const me = gameInfo.players.find(player => player.account_id === account_id)
    me.character = {
      charid: config.main_character_id,
      level: 5,
      exp: 0,
      views: config.views[config.main_character_id].slice(),
      skin: config.skin[config.main_character_id],
      is_upgraded: true,
      extra_emoji: (characterMap.get(acturalCharacter).extra_emoji || []).slice(), // 不能发自己没有的表情
    }
    Object.defineProperty(me.character, 'charid', {
      enumerable: true,
      configurable: true,
      get: function get() { // make ESLint happy
        const inst = window.uiscript.UI_DesktopInfo.Inst,
          isMe = inst && (get.caller === inst.block_emo.initRoom || get.caller === inst.initRoom || get.caller === inst.onShowEmo)
        return isMe ? acturalCharacter : config.main_character_id
      },
    })
    me.title = config.title
    me.avatar_id = config.skin[config.main_character_id]
    return gameInfo
  })
  // 开启牌谱中皮肤装扮
  hookRes('Lobby', 'fetchGameRecord', function (gameRecord) {
    const me = gameRecord.head.accounts.find(account => account.account_id === account_id)
    me.character = {
      charid: config.main_character_id,
      level: 5,
      exp: 0,
      views: config.views[config.main_character_id].slice(),
      skin: config.skin[config.main_character_id],
      is_upgraded: true,
    }
    me.title = config.title
    me.avatar_id = config.skin[config.main_character_id]
    return gameRecord
  })
  // 进入房间时的头像和称号
  hookRes('Lobby', ['createRoom', 'joinRoom', 'fetchRoom'], function (roomInfo) {
    const me = roomInfo.room.persons.find(player => player.account_id === account_id)
    me.title = config.title
    me.avatar_id = config.skin[config.main_character_id]
    return roomInfo
  })
  // 修改背包内装扮牌桌牌背
  let itemSet
  hookRes('Lobby', 'fetchBagInfo', function (bagInfo) {
    if (!bagInfo.bag) bagInfo.bag = {}
    if (!bagInfo.bag.items) bagInfo.bag.items = []
    itemSet = new Set(bagInfo.bag.items.map(item => item.item_id))
    const needItems = window.cfg.item_definition.item.rows_.filter(item => (item.category === 4 || item.category === 5) && !itemSet.has(item.id))
    bagInfo.bag.items = bagInfo.bag.items.concat(needItems.map(item => ({
      item_id: item.id,
      stack: 1,
    })))
    return bagInfo
  })
  // 更换角色
  hookReq('Lobby', 'changeMainCharacter', function (info, callback) {
    config.main_character_id = info.character_id
    if (!config.views[info.character_id]) {
      config.views[info.character_id] = characterMap.has(info.character_id) ? characterMap.get(info.character_id).views.slice() : []
    }
    saveConfig()
    if (characterMap.has(info.character_id) && acturalCharacter !== info.character_id) {
      acturalCharacter = info.character_id
      return [info, callback]
    }
  })
  function changeView(views, key, info) {
    let index = views.findIndex(view => view.slot === info.slot)
    if (index !== -1 && views[index][key] === info[key]) return false // 装上本已有的东西
    if (index === -1) {
      if (info[key] === 0) return false // 卸下本没有的东西
      index = views.length
    }
    if (info[key] === 0) views.splice(index, 1)
    else views[index] = {
      slot: info.slot,
      [key]: info[key],
    }
    return true
  }
  // 更换角色装扮
  hookReq('Lobby', 'changeCharacterView', function (info, callback) {
    if (!config.views[info.character_id]) config.views[info.character_id] = []
    if (changeView(config.views[info.character_id], 'item_id', info)) saveConfig()
    const char = characterMap.get(info.character_id)
    if (char && itemSet.has(info.item_id) && changeView(char.views, 'item_id', info)) {
      return [info, callback]
    }
  })
  // 更换角色皮肤
  hookReq('Lobby', 'changeCharacterSkin', function (info, callback) {
    config.skin[info.character_id] = info.skin
    saveConfig()
    const char = characterMap.get(info.character_id)
    if (char && skinSet.has(info.skin) && char.skin !== info.skin) {
      char.skin = info.skin
      return [info, callback]
    }
  })
  // 升级角色、给角色送礼物
  hookReq('Lobby', ['upgradeCharacter', 'sendGiftToCharacter'], function (info, callback) {
    if (characterMap.has(info.character_id)) return [info, callback]
    setTimeout(callback, 0, 'error')
    console.log('这功能能不能用你自己心里没点AC数吗')
  })
  // 记录 acturalTitleSet，修改称号列表
  let acturalTitleSet
  hookRes('Lobby', 'fetchTitleList', function (titleList) {
    acturalTitleSet = new Set(titleList.title_list)
    acturalTitleSet.add(0)
    return {
      title_list: window.cfg.item_definition.title.rows_.map(title => title.id).filter(id => id !== 600001)
    }
  })
  // 更换称号
  hookReq('Lobby', 'useTitle', function (info, callback) {
    config.title = info.title
    saveConfig()
    if (info.title !== acturalTitle && acturalTitleSet.has(info.title)) return [info, callback]
  })
  // 记录 acturalCommonView，修改牌桌牌背样式
  let acturalCommonView
  hookRes('Lobby', 'fetchCommonView', function (common_view) {
    acturalCommonView = common_view.slots
    return {
      slots: config.common_view.slice(),
    }
  })
  // 更换牌桌牌背样式
  hookReq('Lobby', 'changeCommonView', function (info, callback) {
    if (changeView(config.common_view, 'value', info)) saveConfig()
    if (itemSet.has(info.value) && changeView(acturalCommonView, 'value', info)) {
      return [info, callback]
    }
  })
}())
