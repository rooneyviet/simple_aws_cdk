#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { MainStack } from "../lib/main-stack";

const app = new cdk.App();

const bitwardenKakiandmai = new MainStack(app, "bitwarden-kakiandmai-stack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  vpcCidr: "10.0.0.0/16",
  maxAzs: 2,
  instanceType: "t4g.micro",
  keyName: "barney_key",
  certificateArn:
    "arn:aws:acm:us-east-1:182854672749:certificate/736c3301-4f8e-4503-a2fc-2f980b3ceb3f",
  domainName: "kakiandmai",
  recordName: "bitwarden",
  userdataFile: "userdata.sh",
});
