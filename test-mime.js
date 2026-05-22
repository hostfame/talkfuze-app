async function run() {
  const mediaUrl = "https://fyuymnldgvfvdqcnbsxh.supabase.co/storage/v1/object/public/messages/f47ac10b-58cc-4372-a567-0e02b2c3d479/f8c05ef1-18e9-4e78-bad6-edfb602497fb/media/449339352-870636254580220-4100570691717354316-m_1716327855018.ogg";
  const res = await fetch(mediaUrl);
  console.log(res.headers.get('content-type'));
}
run();
