import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// jpeg quality high enough that the film grain overlay doesn't band.
Config.setJpegQuality(90);
