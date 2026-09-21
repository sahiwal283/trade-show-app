# Set the Authentik application icon for slug "trade-show" (display name Argo)
# to the same public/favicon.svg the app ships, so the tab icon and the
# Authentik launcher tile are one file. Idempotent: re-running overwrites the
# same media file. Falls back to a URL reference if the media store is not
# manageable (e.g. storage.backend switched away from "file").
#
# Usage (from the repo root; requires ssh root@192.168.1.190 key auth):
#   scp public/favicon.svg root@192.168.1.190:/tmp/argo-favicon.svg
#   scp scripts/authentik/set-app-icon.py root@192.168.1.190:/tmp/set_argo_icon.py
#   ssh root@192.168.1.190 "pct push 111 /tmp/argo-favicon.svg /tmp/argo-favicon.svg \
#     && pct push 111 /tmp/set_argo_icon.py /tmp/set_argo_icon.py \
#     && pct exec 111 -- bash -lc 'cd /opt/authentik && .venv/bin/python manage.py shell < /tmp/set_argo_icon.py'"
#
# Verified 2026-09-18 on Authentik 2026.2.2: meta_icon is a plain text field
# managed through authentik.admin.files (file backend, base path
# /opt/authentik-data/media/public); provision-trade-show.sh PATCHes the
# application without meta_icon, so re-provisioning does not clear this.
from authentik.core.models import Application
from authentik.admin.files.manager import get_file_manager
from authentik.admin.files.usage import FileUsage

SRC = "/tmp/argo-favicon.svg"
NAME = "application-icons/argo-favicon.svg"
FALLBACK_URL = "https://argo.booute.duckdns.org/favicon.svg"
a = Application.objects.get(slug="trade-show")
print("BEFORE name=%r icon=%r launch=%r" % (a.name, a.meta_icon, a.meta_launch_url))
fm = get_file_manager(FileUsage.MEDIA)
mb = fm.management_backend
print("STORE  manageable=%r backend=%r base_path=%r" % (fm.manageable, getattr(mb, "name", None), str(getattr(mb, "base_path", "")) if mb else None))
data = open(SRC, "rb").read()
try:
    fm.save_file(NAME, data)
    a.meta_icon = NAME
    a.save(update_fields=["meta_icon"])
    a.refresh_from_db()
    print("AFTER  icon=%r url=%r exists=%r" % (a.meta_icon, a.get_meta_icon, fm.file_exists(NAME)))
except Exception as e:
    print("UPLOAD FAILED (%r); falling back to URL" % (e,))
    a.meta_icon = FALLBACK_URL
    a.save(update_fields=["meta_icon"])
    a.refresh_from_db()
    print("AFTER  icon=%r url=%r" % (a.meta_icon, a.get_meta_icon))
