import { artistV1CollectionRoute } from "@/lib/artistApiV1Route";
import { GET as legacyGET } from "../../../../artists/[ref]/albums/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = artistV1CollectionRoute(legacyGET);
