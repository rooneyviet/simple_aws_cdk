#!/bin/bash
sudo yum update -y
sudo yum -y install docker
sudo systemctl start docker
sudo systemctl enable docker
docker pull vaultwarden/server:latest
docker run -d --name vaultwarden -v /vw-data/:/data/ --restart unless-stopped -p 80:80 vaultwarden/server:latest