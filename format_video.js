const fs = require('fs');

let content = fs.readFileSync('src/app/widget/[org_id]/page.tsx', 'utf-8');

// The replacement logic:
// Inside the render for replies, we have:
// <div className="whitespace-pre-wrap break-words">{reply.message}</div>
const target = `<div className="whitespace-pre-wrap break-words">{reply.message}</div>`;

const replacement = `{(() => {
                            let text = reply.message || '';
                            const videoRegex = /Video Attached:\\n((?:https?:\\/\\/[^\\s]+\\n?)+)/;
                            const match = text.match(videoRegex);
                            let videoLinks = [];
                            if (match) {
                              text = text.replace(match[0], '').trim();
                              videoLinks = match[1].split('\\n').filter(Boolean);
                            }
                            return (
                              <>
                                {text && <div className="whitespace-pre-wrap break-words">{text}</div>}
                                {videoLinks.length > 0 && (
                                  <div className={\`flex flex-col gap-1.5 \${text ? 'mt-2 pt-2 border-t' : ''} \${reply.admin ? 'border-slate-100' : 'border-white/10'}\`}>
                                    {videoLinks.map((link, lIdx) => (
                                      <a key={lIdx} href={link} target="_blank" rel="noopener noreferrer" className={\`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border \${reply.admin ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600' : 'bg-white/20 hover:bg-white/30 border-white/10 text-white'} transition-colors\`}>
                                        <Video size={12} className="shrink-0 opacity-80" />
                                        <span className="text-[11.5px] truncate max-w-[150px] font-medium tracking-tight">View Video</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                          })()}`;

content = content.replace(target, replacement);

// Do the same for the main ticket body
const mainTarget = `<div className="whitespace-pre-wrap break-words">{selectedTicket.message}</div>`;
const mainReplacement = `{(() => {
                         let text = selectedTicket.message || '';
                         const videoRegex = /Video Attached:\\n((?:https?:\\/\\/[^\\s]+\\n?)+)/;
                         const match = text.match(videoRegex);
                         let videoLinks = [];
                         if (match) {
                           text = text.replace(match[0], '').trim();
                           videoLinks = match[1].split('\\n').filter(Boolean);
                         }
                         return (
                           <>
                             {text && <div className="whitespace-pre-wrap break-words">{text}</div>}
                             {videoLinks.length > 0 && (
                               <div className={\`flex flex-col gap-1.5 \${text ? 'mt-2 pt-2 border-t border-slate-100' : ''}\`}>
                                 {videoLinks.map((link, lIdx) => (
                                   <a key={lIdx} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 transition-colors w-max">
                                     <Video size={12} className="shrink-0 opacity-80" />
                                     <span className="text-[11.5px] truncate max-w-[150px] font-medium tracking-tight">View Video</span>
                                   </a>
                                 ))}
                               </div>
                             )}
                           </>
                         );
                       })()}`;
                       
content = content.replace(mainTarget, mainReplacement);

fs.writeFileSync('src/app/widget/[org_id]/page.tsx', content);
console.log("Formatted video links in ticket UI");
