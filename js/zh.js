/* 中文 for TT Ski Downhill: the words on the page, the toasts, the START and FINISH banners (drawn through
   Kit.lang.t in js/world.js) and the ? panel (Kit.lang, from kit/lang.js). Simple words: Tommy is 5.
   The kids' names, Foxy and Froggy, and the game's own name stay in English on purpose. */
(function () {
  const L = Kit.lang;
  const title = window.SKI_TITLE;
  const words = title.split(' ');
  L.keep(['TEDDY', 'TOMMY', 'FOXY', 'FROGGY', 'Teddy', 'Tommy', title, words.slice(0, -1).join(' '), words[words.length - 1], 'Esc']);

  L.add({
    // home
    'Pick a slope': '选一条雪道', 'Time trial or race': '计时赛还是比赛', 'TIME TRIAL': '计时赛', 'RACE': '比赛',
    'Time trial (R)': '计时赛 (R)', 'Race (R)': '比赛 (R)', "Who's skiing?": '谁来滑雪？', 'BOTH': '一起滑',
    'Teddy skis': 'Teddy 滑雪', 'Tommy skis': 'Tommy 滑雪', 'Teddy and Tommy ski': 'Teddy 和 Tommy 一起滑',
    'BUNNY HILL': '小兔坡', 'PINE FOREST': '松树林', 'BIG MOUNTAIN': '大雪山', 'Ski!': '滑雪！', 'Ski! (Enter)': '滑雪！(回车)',
    // skiing
    'Pause': '暂停', 'Pause (P)': '暂停 (P)', 'Sound (M)': '声音 (M)', 'Sound on or off': '声音 开 / 关',
    'Call your brother': '叫兄弟来帮忙', 'High five': '击掌', 'Steer left': '往左滑', 'Steer right': '往右滑',
    'Tuck': '蹲下加速', 'Jump': '跳', 'TUCK': '蹲下', 'JUMP': '跳',
    'GO!': '出发！', 'START': '起点', 'FINISH': '终点',
    'TRICK! ZOOM!': '漂亮的空中动作！冲呀！', 'BONK! A SNOWMAN!': '咚！撞到雪人啦！', 'BONK!': '咚！', '✋ HIGH FIVE!': '✋ 击掌！',
    // pause, results
    'Keep skiing': '继续滑', 'Start again': '重新开始', 'Slopes': '选雪道', 'Play again': '再玩一次', 'Next slope': '下一条雪道',
    'NEW BEST!': '新纪录！',
    // the ? panel (js/keys.js)
    'Teddy (left)': 'Teddy（左边）', 'Tommy (right)': 'Tommy（右边）',
    'steer left / right': '往左 / 往右滑', 'tuck down low: faster!': '蹲低：滑得更快！', 'jump · a trick in the air': '跳 · 空中动作',
    'pick a slope': '选雪道', 'level 🐣 / 🔥': '难度 🐣 / 🔥', 'who skis': '谁来滑', 'time trial or race': '计时赛或比赛',
    'ski! · again': '滑雪！· 再来',
    'Ski between the two flags of every gate. A missed gate adds seconds to your time. Do a trick on a ramp and land it for a speed boost. In 1 player both sets of keys work and T calls your brother for a speed tuck; with 2 players, T is a high five.':
      '从每个旗门的两面小旗中间滑过去。漏掉一个旗门，时间就会加几秒。在跳台上做空中动作，稳稳落地就能加速。一个人玩时两套按键都能用，T 叫兄弟来帮你蹲下加速；两个人玩时，T 是击掌。',
    "Hold ◀ ▶ to steer, hold ⬇ to tuck, tap ⬆ to jump. Tap your brother's face to call him.":
      '按住 ◀ ▶ 转弯，按住 ⬇ 蹲下加速，点 ⬆ 跳。点兄弟的头像叫他来。',
  });

  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  const PLACE = (n) => `第${n}名`;
  L.rule(/^(\d+)(ST|ND|RD|TH)$/, (m, n) => PLACE(n));
  L.rule(/^MISSED A GATE! \+(\d+)s$/, '漏掉旗门！加 $1 秒');
  L.rule(/^❌(\d+) \+(\d+)s$/, '❌$1 加 $2 秒');
  L.rule(/^🏁 FINISH! (.+)$/, '🏁 到终点啦！$1');
  L.rule(/^(\S+) SAYS: TUCK AND ZOOM!$/, '$1 说：蹲下来，冲呀！');
  L.rule(/^(\S+) (ICE CREAM|WATER|JUICE BOX|COOKIE|WATERMELON|BANANA) FROM (.+)!$/, (m, emoji, item, who) => `${emoji} ${who} 给你${TREAT[item]}！`);
  L.rule(/^🎉 GREAT RUN, (\S+)!$/, '🎉 $1 滑得真棒！');
  L.rule(/^🏆 (\S+) WINS!$/, '🏆 $1 赢啦！');
  L.rule(/^(\S+) (\S+) WINS! (\d+)(ST|ND|RD|TH) PLACE, GOOD TRY!$/, (m, e, who, n) => `${e} ${who} 赢啦！你是${PLACE(n)}，加油！`);
  L.rule(/^(TEDDY|TOMMY): BEST (.+) · 🏆 (\d+)$/, '$1：最快 $2 · 🏆 $3');
})();
