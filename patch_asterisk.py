import re

with open('/etc/asterisk/extensions.conf', 'r') as f:
    content = f.read()

# Replace the s extension in hostnin-robocall
old_s = """exten => s,1,NoOp(Robocall answered by ${CALLERID(num)})
 same => n,Set(START_TIME=${EPOCH})
 same => n,Answer()"""

new_s = """exten => s,1,NoOp(Robocall answered by ${CALLERID(num)})
 same => n,Set(START_TIME=${EPOCH})
 same => n,Set(CALLFILENAME=ROBO-${DIALED_NUMBER}-${STRFTIME(${EPOCH},,%Y%m%d-%H%M%S)}-${UNIQUEID})
 same => n,MixMonitor(${RECORDING_DIR}${CALLFILENAME}.wav,b)
 same => n,Answer()"""

content = content.replace(old_s, new_s)

# Replace the h extension
old_h = """same => n,System(/usr/local/bin/log_call.sh "outbound" "09617875955" "${DIALED_NUMBER}" "${DURATION}" "${DIALSTATUS}" "None" "Hostnin Autodialer" "${DIGIT}" "${AGENT_USER}" &)"""
new_h = """same => n,System(/usr/local/bin/log_call.sh "outbound" "09617875955" "${DIALED_NUMBER}" "${DURATION}" "${DIALSTATUS}" "${CALLFILENAME}.wav" "Hostnin Autodialer" "${DIGIT}" "${AGENT_USER}" &)"""

content = content.replace(old_h, new_h)

with open('/etc/asterisk/extensions.conf', 'w') as f:
    f.write(content)
print("Patched successfully")
