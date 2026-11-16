import { Navigate } from "react-router-dom";
import { APOLLO_GUIDE_PATH } from "@/data/search-guides";

/** Retain old bookmarks while consolidating the broad alternatives intent. */
export default function ApolloAlternative() {
  return <Navigate to={APOLLO_GUIDE_PATH} replace />;
}