const { default: axios } = require('axios')
var xml2js = require('xml2js')

var parser = new xml2js.Parser(/* options */)
function createDupkey() {
  // 格式:3b443c7c-a87f-468d-ba38-46d407aaf23a
  var s = []
  var hexDigits = '0123456789abcdef'
  for (var i = 0; i < 36; i++) {
    s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1)
  }
  s[14] = '4' // bits 12-15 of the time_hi_and_version field to 0010
  s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1) // bits 6-7 of the clock_seq_hi_and_reserved to 01
  s[8] = s[13] = s[18] = s[23] = '-'
  return s.join('')
}
module.exports = async (query, request) => {
  let ext = 'mp3'
  if (query.songFile.name.indexOf('flac') > -1) {
    ext = 'flac'
  }

  const filename =
    query.filename ||
    query.songFile.name
      .replace('.' + ext, '')
      .replace(/\s/g, '')
      .replace(/\./g, '_')
  // query.cookie.os = 'pc'
  // query.cookie.appver = '2.9.7'
  if (!query.songFile) {
    return Promise.reject({
      status: 500,
      body: {
        msg: '请上传音频文件',
        code: 500,
      },
    })
  }

  const tokenRes = await request(
    'POST',
    `https://music.163.com/weapi/nos/token/alloc`,
    {
      bucket: 'ymusic',
      ext: ext,
      filename: filename,
      local: false,
      nos_product: 0,
      type: 'other',
    },
    { crypto: 'weapi', cookie: query.cookie, proxy: query.proxy },
  )

  const objectKey = tokenRes.body.result.objectKey.replace('/', '%2F')
  const docId = tokenRes.body.result.docId
  const res = await axios({
    method: 'post',
    url: `https://ymusic.nos-hz.163yun.com/${objectKey}?uploads`,
    headers: {
      'x-nos-token': tokenRes.body.result.token,
      'X-Nos-Meta-Content-Type': 'audio/mpeg',
    },
    data: null,
  })
  // return xml
  const res2 = await parser.parseStringPromise(res.data)

  const res3 = await axios({
    method: 'put',
    url: `https://ymusic.nos-hz.163yun.com/${objectKey}?partNumber=1&uploadId=${res2.InitiateMultipartUploadResult.UploadId[0]}`,
    headers: {
      'x-nos-token': tokenRes.body.result.token,
      'Content-Type': 'audio/mpeg',
    },
    data: query.songFile.data,
  })

  // get etag
  const etag = res3.headers.etag

  // 文件处理
  await axios({
    method: 'post',
    url: `https://ymusic.nos-hz.163yun.com/${objectKey}?uploadId=${res2.InitiateMultipartUploadResult.UploadId[0]}`,
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'X-Nos-Meta-Content-Type': 'audio/mpeg',
      'x-nos-token': tokenRes.body.result.token,
    },
    data: `<CompleteMultipartUpload>
     <Part><PartNumber>1</PartNumber><ETag>${etag}</ETag></Part>
     </CompleteMultipartUpload>`,
  })

  // preCheck
  await request(
    'post',
    `https://interface.music.163.com/weapi/voice/workbench/voice/batch/upload/preCheck`,
    {
      dupkey: createDupkey(),
      voiceData: JSON.stringify([
        {
          name: filename,
          autoPublish: true,
          autoPublishText: '',
          description: query.description,
          // 换成自己的
          voiceListId: query.voiceListId,
          coverImgId: query.coverImgId,
          dfsId: docId,
          categoryId: query.categoryId,
          secondCategoryId: query.secondCategoryId,
          composedSongs: [],
          privacy: true,
          publishTime: 0,
          orderNo: 1,
        },
      ]),
    },
    {
      crypto: 'weapi',
      cookie: query.cookie,
      proxy: query.proxy,
      headers: {
        'x-nos-token': tokenRes.body.result.token,
      },
    },
  )
  const result = await request(
    'post',
    `https://interface.music.163.com/weapi/voice/workbench/voice/batch/upload/v2`,
    {
      dupkey: createDupkey(),
      voiceData: JSON.stringify([
        {
          name: filename,
          autoPublish: true,
          autoPublishText: '',
          description: query.description,
          // 换成自己的
          voiceListId: query.voiceListId || 994681645,
          coverImgId: query.coverImgId,
          dfsId: docId,
          categoryId: query.categoryId,
          secondCategoryId: query.secondCategoryId || 466050,
          composedSongs: [],
          privacy: true,
          publishTime: 0,
          orderNo: 1,
        },
      ]),
    },
    {
      crypto: 'weapi',
      cookie: query.cookie,
      proxy: query.proxy,
      headers: {
        'x-nos-token': tokenRes.body.result.token,
      },
    },
  )
  return {
    status: 200,
    body: {
      code: 200,
      data: result.body.data,
    },
  }
}
