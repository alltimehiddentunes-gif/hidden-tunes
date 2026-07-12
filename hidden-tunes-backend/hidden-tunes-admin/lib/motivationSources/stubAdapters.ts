import type { MotivationDiscoveryOptions, MotivationDiscoveryPage, MotivationSourceAdapter } from "@/lib/motivationSources/types";

function emptyPage(provider: string, queryFamily: string): MotivationDiscoveryPage {
  return {
    candidates: [],
    nextPage: null,
    nextCursor: null,
    queryFamily,
    provider,
  };
}

export class GovernmentArchiveMotivationSource implements MotivationSourceAdapter {
  sourceKey = "gov:public-archive";
  provider = "government_archive";

  async discoverPage(options: MotivationDiscoveryOptions): Promise<MotivationDiscoveryPage> {
    return emptyPage(this.provider, options.queryFamily || "default");
  }
}

export class UniversityOpenMediaMotivationSource implements MotivationSourceAdapter {
  sourceKey = "university:open-media";
  provider = "university_open_media";

  async discoverPage(options: MotivationDiscoveryOptions): Promise<MotivationDiscoveryPage> {
    return emptyPage(this.provider, options.queryFamily || "default");
  }
}

export class PublicSpeechMotivationSource implements MotivationSourceAdapter {
  sourceKey = "speech:public-archive";
  provider = "public_speech";

  async discoverPage(options: MotivationDiscoveryOptions): Promise<MotivationDiscoveryPage> {
    return emptyPage(this.provider, options.queryFamily || "default");
  }
}

export class CreatorFeedMotivationSource implements MotivationSourceAdapter {
  sourceKey = "creator:approved-feed";
  provider = "creator_feed";

  async discoverPage(options: MotivationDiscoveryOptions): Promise<MotivationDiscoveryPage> {
    return emptyPage(this.provider, options.queryFamily || "default");
  }
}

export class RssMotivationSource implements MotivationSourceAdapter {
  sourceKey = "rss:approved-feed";
  provider = "rss";

  async discoverPage(options: MotivationDiscoveryOptions): Promise<MotivationDiscoveryPage> {
    return emptyPage(this.provider, options.queryFamily || "default");
  }
}
