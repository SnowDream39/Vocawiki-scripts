const categoriesMap = {
  Animator: "PV",
  Arranger: "编曲",
  Composer: "作曲",
  Distributor: "发行",
  EffectiveVocalist: "和声",
  Illustrator: "曲绘",
  Instrumentalist: "演奏",
  Lyricist: "作词",
  Mastering: "母带",
  Mixer: "混音",
  Other: "其他",
  Producer: "词·曲",
  Publisher: "出版",
  VocalDataProvider: "音源",
  Vocalist: "演唱",
  VoiceManipulator: "调教",
};

const platformIconsMap = {
  Youtube: "https://voca.wiki/images/6/60/YouTube_Icon_Red.svg",
  Bilibili: "https://voca.wiki/images/f/f5/Bilibili_Icon.svg",
  SoundCloud: "https://voca.wiki/images/7/7d/SoundCloud_Icon.svg",
  NicoNicoDouga: "https://voca.wiki/images/e/e0/Niconico_Logo_%282020%29.svg",
};

// =========== 小工具函数 =========

/**
 *
 * @param {any} obj
 * @param {string} key
 * @param {unknown} value
 */

function addToGroup(obj, key, value) {
  if (!obj[key]) {
    obj[key] = [];
  }
  obj[key].push(value);
}

async function runWithConcurrency(tasks, limit) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  // 启动 limit 个 worker
  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);

  return results;
}

// =========== API 调用 ===========

async function fetchArtistData(artistId) {
  const response = await fetch(
    `https://vocadb.net/api/artists/${artistId}?lang=Default`
  );
  return await response.json();
}

async function fetchArtistSongsData(artistId, page = 1, pageSize = 10) {
  const response = await fetch(
    `https://vocadb.net/api/songs?start=${
      pageSize * (page - 1)
    }&getTotalCount=true&maxResults=${pageSize}&query=&fields=Artists,MainPicture,PVs&lang=Default&nameMatchMode=Auto&sort=PublishDate&childTags=false&artistId%5B%5D=${artistId}&artistParticipationStatus=Everything&songTypes=Original,Remaster,Remix,Cover&onlyWithPvs=true`
  );
  return await response.json();
}

async function fetchSongData(songId) {
  const response = await fetch(
    `https://vocadb.net/api/songs/${songId}?fields=Artists,MainPicture,PVs&lang=Default`
  );
  return await response.json();
}

// =========== 业务逻辑 ===========

/**
 * 生成一份artist列表
 * @param {*} artists
 * @returns any[]
 */
function makeStaff(artists) {
  let roles;
  const staff = {};
  const producers = [];
  for (const artist of artists) {
    if (artist.categories === "Other") {
      roles = artist.effectiveRoles;
    } else if (artist.categories === "Vocalist") {
      roles = "Vocalist";
    } else if (artist.categories.includes("Producer")) {
      producers.push(artist.name);
      if (artist.effectiveRoles === "Default") {
        roles = "Producer"; // 词·曲
      } else {
        roles = artist.effectiveRoles;
      }
    } else {
      roles = artist.categories;
    }
    for (const role of roles.split(", ")) {
      addToGroup(staff, role, artist.name);
    }
  }
  staff.Vocalist = Array.from(new Set(staff.Vocalist));
  // 以上是原来的逻辑，生成一个object。接下来把它变成一个数组
  const staffArray = [];
  for (let [key, value] of Object.entries(staff)) {
    staffArray.push({
      role: categoriesMap[key],
      names: value,
    });
  }

  return staffArray;
}

/**
 * 去掉不符合标准的条目，并添加一些额外信息
 * @param {Array} songsData
 */
function modifySongsData(songsData) {
  // ========== 根据PV筛选歌曲 ===========
  songsData.forEach((song) => {
    // 去掉YouTube自动生成视频
    song.pvs = song.pvs.filter((pv) => pv.author.slice(-5) != "Topic");
  });
  // 去掉没有任何PV的视频
  songsData = songsData.filter((song) => song.pvs.length > 0);

  // ========== 添加额外信息 ===========
  // 生成staff列表
  for (const song of songsData) {
    song.artistsArray = makeStaff(song.artists);
    for (const [index, artist] of song.artistsArray.entries()) {
      if (artist.role === "演唱") {
        song.vocalists = artist.names;
        song.artistsArray.splice(index, 1);
      }
    }
  }
  songsData.forEach((song) => {
    // 为每个PV添加图标
    song.pvs.forEach((pv) => {
      pv.icon = platformIconsMap[pv.service] || "";
    });
    // 选出一个最合适的缩略图
    
    song.bestThumbnailUrl = song.pvs.filter(
      (pv) => ["NicoNicoDouga", "Bilibili"].includes(pv.service)
    )[0]?.thumbUrl;
  });
  return songsData;
}

/**
 * 去掉不符合标准的条目，并添加一些额外信息
 * @param {Array} songsData
 */
function modifySongData(song) {

  song.artistsArray = makeStaff(song.artists);
  for (const [index, artist] of song.artistsArray.entries()) {
    if (artist.role === "演唱") {
      song.vocalists = artist.names;
      song.artistsArray.splice(index, 1);
    }
  }

  song.pvs.forEach((pv) => {
    pv.icon = platformIconsMap[pv.service] || "";
  });
  // 选出一个最合适的缩略图
  
  song.bestThumbnailUrl = song.pvs.filter(
    (pv) => ["NicoNicoDouga", "Bilibili"].includes(pv.service)
  )[0]?.thumbUrl;

  return song;
}

/**
 * 
 * @param {number} id 
 */
function loadProducerWorks(id) {
  document.addEventListener("alpine:init", () => {
    Alpine.data("artistData", () => ({
      songs: [],

      async init() {
        function render(object, songsData) {
          object.songs = songsData.map((song) => ({
            id: song.id,
            name: song.name,
            publishDate: song.publishDate
              ? new Date(song.publishDate).toLocaleDateString()
              : "未知",
            url: `https://vocadb.net/S/${song.id}`,
            artists: song.artistsArray,
            pvs: song.pvs,
            thumb: song.bestThumbnailUrl,
            vocalists: song.vocalists || [],
          }));
        }

        const artistId = await (await fetch("https://api.voca.wiki/entry/producer/id?entry=海茶")).text()

        response = await fetch("https://api.voca.wiki/entry/producer/song?id=" + artistId)
        const data = await response.json()

        const tasks = data.map(item => () => fetchSongData(item.song_id));
        const results = await runWithConcurrency(tasks, 10);
        let songsData = results.map(songData => modifySongData(songData));

        render(this, songsData);
      },
    }));
  });
}
