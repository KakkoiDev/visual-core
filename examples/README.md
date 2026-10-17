# Runnable examples

From the core checkout:

```sh
python3 tools/visual.py init web-app --out .test-output/web-app
python3 tools/visual.py template robot > .test-output/robot.json
python3 tools/visual.py create .test-output/robot.json --out .test-output/web-app/assets/robot
python3 -m http.server 8080 --directory .test-output/web-app
```

Open the app and its assets/robot/0001/preview.html. If .test-output/web-app already
exists, reuse it or choose another fresh folder; init never overwrites a project.
For a UI review, create representative example projects through the app's form;
these are local demonstration data, not real users or a claimed external consumer.
The checked-in robot output is a small reference export, not an external integration.
