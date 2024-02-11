#!/bin/bash

# Set your profile name
profile="barney"

# Authenticate AWS SSO
aws sso login --profile $profile

# Get AWS Account and Region
account=$(aws sts get-caller-identity --profile $profile --query "Account" --output text)
region=$(aws configure get region --profile $profile)

# Export as environment variables
export CDK_DEFAULT_ACCOUNT=$account
export CDK_DEFAULT_REGION=$region