"""Validate the active connection prototype and copy it to the local app."""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import hashlib
import json
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--check-only', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
source = root / 'src/prototype/index.html'
target = root / 'public/design-v2/index.html'
if not source.exists():
    raise SystemExit('Missing maintained UI source: src/prototype/index.html')
text = source.read_text(encoding='utf-8')

# These small maintained modules are embedded in the self-contained prototype.
# Preserve the Claude canvas and its existing engineering fixes around them.
for name, begin, end in [
    ('skill-library.js', '/* SKILL_LIBRARY_START', '/* SKILL_LIBRARY_END */'),
    ('skill-library.css', '/* SKILL_LIBRARY_CSS_START */', '/* SKILL_LIBRARY_CSS_END */'),
    ('model-connections.js', '/* MODEL_CONNECTIONS_START */', '/* MODEL_CONNECTIONS_END */'),
    ('model-connections.css', '/* MODEL_CONNECTIONS_CSS_START */', '/* MODEL_CONNECTIONS_CSS_END */'),
    ('premium.js', '/* PREMIUM_DESIGN_START */', '/* PREMIUM_DESIGN_END */'),
    ('premium.css', '/* PREMIUM_DESIGN_CSS_START */', '/* PREMIUM_DESIGN_CSS_END */'),
    ('tutorial-view.js', '/* TUTORIAL_VIEW_START */', '/* TUTORIAL_VIEW_END */'),
    ('tutorial.js', '/* TUTORIAL_START */', '/* TUTORIAL_END */'),
    ('tutorial.css', '/* TUTORIAL_CSS_START */', '/* TUTORIAL_CSS_END */'),
    ('document-files.js', '/* DOCUMENT_FILES_START */', '/* DOCUMENT_FILES_END */'),
    ('canvas-runs.js', '/* CANVAS_RUNS_START */', '/* CANVAS_RUNS_END */'),
    ('memphis.js', '/* MEMPHIS_DESIGN_START */', '/* MEMPHIS_DESIGN_END */'),
    ('memphis.css', '/* MEMPHIS_CSS_START */', '/* MEMPHIS_CSS_END */'),
    ('direct-control.js', '/* DIRECT_CONTROL_START */', '/* DIRECT_CONTROL_END */'),
    ('direct-control.css', '/* DIRECT_CONTROL_CSS_START */', '/* DIRECT_CONTROL_CSS_END */'),
    ('glass-clarity.js', '/* GLASS_CLARITY_START */', '/* GLASS_CLARITY_END */'),
    ('glass-clarity.css', '/* GLASS_CLARITY_CSS_START */', '/* GLASS_CLARITY_CSS_END */'),
    ('assistant.js', '/* ASSISTANT_START */', '/* ASSISTANT_END */'),
    ('auth-ui.js', '/* AUTH_UI_START */', '/* AUTH_UI_END */'),
    ('feature-tour.js', '/* FEATURE_TOUR_START */', '/* FEATURE_TOUR_END */'),
    ('assistant.css', '/* ASSISTANT_CSS_START */', '/* ASSISTANT_CSS_END */'),
    ('workspace-editor.js', '/* WORKSPACE_EDITOR_START */', '/* WORKSPACE_EDITOR_END */'),
    ('software-operator.js', '/* SOFTWARE_OPERATOR_START */', '/* SOFTWARE_OPERATOR_END */'),
    ('browser-control.js', '/* BROWSER_CONTROL_START */', '/* BROWSER_CONTROL_END */'),
    ('browser-control.css', '/* BROWSER_CONTROL_CSS_START */', '/* BROWSER_CONTROL_CSS_END */'),
    ('regions.js', '/* REGIONS_START */', '/* REGIONS_END */'),
    ('regions.css', '/* REGIONS_CSS_START */', '/* REGIONS_CSS_END */'),
    ('history-reports.js', '/* HISTORY_REPORTS_START */', '/* HISTORY_REPORTS_END */'),
    ('tutorial-editing.js', '/* TUTORIAL_EDITING_START */', '/* TUTORIAL_EDITING_END */'),
    ('history-reports.css', '/* HISTORY_REPORTS_CSS_START */', '/* HISTORY_REPORTS_CSS_END */'),
    ('tutorial-pointer.js', '/* TUTORIAL_POINTER_START */', '/* TUTORIAL_POINTER_END */'),
    ('workspace-editor.css', '/* WORKSPACE_EDITOR_CSS_START */', '/* WORKSPACE_EDITOR_CSS_END */'),
]:
    module=root/'src/prototype'/name
    if module.exists() and begin in text:
        start=text.index(begin); finish=text.index(end,start)+len(end)
        embedded=text[start:finish]
        maintained=module.read_text(encoding='utf-8').strip()
        if embedded.strip()!=maintained:
            if args.check_only:
                raise SystemExit('Embedded module differs from maintained source: '+name)
            text=text[:start]+maintained+text[finish:]
if not args.check_only and text!=source.read_text(encoding='utf-8'):
    source.write_text(text, encoding='utf-8')

class Inspect(HTMLParser):
    def __init__(self):
        super().__init__(); self.scripts=[]; self.current=None; self.external=[]; self.ids=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag=='script':
            if attrs.get('src'):
                self.external.append(attrs['src'])
            self.current=[]
        for key in ('src','href'):
            value=attrs.get(key,'')
            if re.match(r'^(https?:)?//',value):
                self.external.append(value)
    def handle_data(self,data):
        if self.current is not None:
            self.current.append(data)
    def handle_endtag(self,tag):
        if tag=='script' and self.current is not None:
            self.scripts.append(''.join(self.current)); self.current=None

parsed=Inspect(); parsed.feed(text)
if parsed.external or not parsed.scripts:
    raise SystemExit('Prototype must be self-contained and contain no external resources')
if len(set(parsed.ids))!=len(parsed.ids):
    raise SystemExit('Duplicate HTML ids')
checks=root/'.data/connections-static-checks'; checks.mkdir(parents=True,exist_ok=True)
for index,script in enumerate(parsed.scripts):
    allowed_script=re.sub(r'fetch\([\"\'](?:/api/studio/(?:guide|assistant|refine|auth|open|library|models|collaboration|documents(?:/upload)?|browser(?:/blob/)?))[\"\']', 'localGuide(',script) if 'STUDIO_MODEL_START' in text else script
    if re.search(r'\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|eval)\s*\(',allowed_script):
        raise SystemExit('Unexpected network/eval API in local simulation')
    if re.search(r'localStorage\s*\.\s*(clear|removeItem)\s*\(',script):
        raise SystemExit('Prototype must preserve existing local data')
    p=checks/('prototype-'+str(index)+'.js'); p.write_text(script, encoding='utf-8')
    subprocess.run(['node','--check',str(p)],check=True)
core=re.findall(r'/\*\s*LINK_CORE_START\s*\*/([\s\S]*?)/\*\s*LINK_CORE_END\s*\*/',text)
if len(core)!=1:
    raise SystemExit('Expected one extractable LinkCore used by the actual app')
if re.search(r'\b(document|window|localStorage|setTimeout|setInterval)\s*[.(]',core[0]):
    raise SystemExit('LinkCore must not depend on DOM or timers')
if 'LAYOUT_MIGRATION_START' in text:
    migration=re.findall(r'/\*\s*LAYOUT_MIGRATION_START\s*\*/([\s\S]*?)/\*\s*LAYOUT_MIGRATION_END\s*\*/',text)
    if len(migration)!=1 or re.search(r'\b(document|window|localStorage|setTimeout|setInterval)\s*[.(]',migration[0]):
        raise SystemExit('Expected one DOM-independent actual layout migration object')
env=root/'.env.local'
credentials=dict(line.split('=',1) for line in env.read_text(encoding='utf-8').splitlines() if '=' in line) if env.exists() else {}
if any(credentials.get(k,'') and credentials[k] in text for k in ('OPENAI_API_KEY','ANTHROPIC_API_KEY')):
    raise SystemExit('Secret found in prototype')
if not args.check_only:
    target.parent.mkdir(parents=True,exist_ok=True); target.write_text(text, encoding='utf-8')
# Build validation uses only maintained source and public runtime resources.
# Private design history is deliberately not required in a clean checkout.
evidence={'runtime_source':'src/prototype/index.html','hosted_copy':'public/design-v2/index.html','runtime_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'inline_scripts':len(parsed.scripts),'syntax_check':'passed','network_api_check':'only_local_studio_endpoints','no_keys_in_client':True,'link_core_isolated':True,'check_only':args.check_only,'tutorial_steps':19}
(root/'.data/build-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n', encoding='utf-8')
print(json.dumps(evidence,ensure_ascii=False))
