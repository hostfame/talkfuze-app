#!/bin/bash
# Delete recordings older than 7 days
find /var/spool/asterisk/monitor/ -name "*.wav" -type f -mtime +7 -delete
