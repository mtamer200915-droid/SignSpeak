"""Experimental local digit classifier; preserve the existing held-out split.

The exported model is a candidate only. The random image split is not an
independent signer or camera evaluation and is not sufficient for deployment.
"""
import argparse
import hashlib
import io
import json
import random
import time
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image
import tensorflow as tf

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--digits-zip', type=Path, required=True, help='Original local number-image archive')
parser.add_argument('--heldout-cache', type=Path, required=True, help='Prepared character dataset with val/<digit> and test/<digit>')
parser.add_argument('--output', type=Path, required=True, help='Local candidate output directory; do not point to the deployed model directory')
parser.add_argument('--character-model', type=Path, default=root / 'api/models/signova_characters.keras')
args = parser.parse_args()
cache = args.heldout_cache
out = args.output
if out.resolve() == (root / 'api/models').resolve():
    raise SystemExit('Choose a separate output directory for the experimental model.')
out.mkdir(parents=True, exist_ok=True)
labels = list('0123456789')
seed = 42
random.seed(seed)
tf.keras.utils.set_random_seed(seed)

def digest(content):
    return hashlib.sha256(content).hexdigest()

heldout = set()
for split in ('val', 'test'):
    for label in labels:
        images = [p for p in (cache / split / label).glob('*') if p.is_file()]
        if not images:
            raise SystemExit(f'Missing {split} images for digit {label} in {cache}.')
        heldout.update(digest(p.read_bytes()) for p in images)

old = tf.keras.models.load_model(args.character_model, compile=False)
backbone = old.get_layer('mobilenetv2_1.00_224')
backbone.trainable = False

def pixels(content):
    with Image.open(io.BytesIO(content)) as img:
        return np.asarray(img.convert('RGB').resize((224, 224), Image.Resampling.BILINEAR), dtype=np.float32)

def features(rows):
    result, classes = [], []
    start_time = time.time()
    for start in range(0, len(rows), 32):
        batch = rows[start:start + 32]
        images = np.stack([pixels(row[0]) for row in batch])
        result.append(backbone(tf.convert_to_tensor(images / 127.5 - 1), training=False).numpy())
        classes.extend(int(row[1]) for row in batch)
        if start == 0 or (start // 32 + 1) % 25 == 0 or start + 32 >= len(rows):
            print(f'Encoded {min(start + 32, len(rows))}/{len(rows)} in {time.time()-start_time:.1f}s', flush=True)
    return np.concatenate(result), np.asarray(classes, dtype=np.int32)

print('Reading archive and excluding held-out image hashes...', flush=True)
rows = []
seen = set(heldout)
counts = {label: 0 for label in labels}
with zipfile.ZipFile(args.digits_zip) as archive:
    for info in archive.infolist():
        parts = info.filename.replace('\\', '/').split('/')
        if len(parts) < 3 or parts[0] != 'Sign Language for Numbers' or parts[1] not in labels:
            continue
        if Path(info.filename).suffix.lower() not in ('.jpg', '.jpeg', '.png'):
            continue
        content = archive.read(info)
        h = digest(content)
        if h in seen:
            continue
        seen.add(h)
        rows.append((content, parts[1]))
        counts[parts[1]] += 1
print('Unique training images:', counts, flush=True)
random.shuffle(rows)

def heldout_rows(split):
    return [(p.read_bytes(), label) for label in labels
            for p in sorted((cache / split / label).glob('*')) if p.is_file()]

train_x, train_y = features(rows)
del rows
val_rows = heldout_rows('val')
test_rows = heldout_rows('test')
val_x, val_y = features(val_rows)
test_x, test_y = features(test_rows)

inp = tf.keras.Input((1280,))
x = tf.keras.layers.Dropout(.35)(inp)
x = tf.keras.layers.Dense(256, activation='relu', kernel_regularizer=tf.keras.regularizers.l2(.001))(x)
x = tf.keras.layers.Dropout(.30)(x)
head = tf.keras.Model(inp, tf.keras.layers.Dense(10, activation='softmax')(x))
head.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=.001), loss='sparse_categorical_crossentropy', metrics=['accuracy'])
head.fit(train_x, train_y, validation_data=(val_x, val_y), epochs=35, batch_size=64, verbose=2,
         callbacks=[tf.keras.callbacks.EarlyStopping(monitor='val_accuracy', patience=6, mode='max', restore_best_weights=True),
                    tf.keras.callbacks.ReduceLROnPlateau(monitor='val_loss', patience=2, factor=.5, min_lr=1e-5)])

new_prob = head.predict(test_x, verbose=0)
old_head = old.get_layer('signova_asl_character_classifier')
old_prob = old_head.predict(test_x, verbose=0)[:, :10]
old_pred = old_prob.argmax(axis=1)
new_pred = new_prob.argmax(axis=1)
report = {'train_counts': counts, 'test_count': len(test_y),
          'old_digit_only_top1': float(np.mean(old_pred == test_y)),
          'candidate_top1': float(np.mean(new_pred == test_y)),
          'per_digit': {label: {'count': int(np.sum(test_y == int(label))),
                                'old_accuracy': float(np.mean(old_pred[test_y == int(label)] == int(label))),
                                'candidate_accuracy': float(np.mean(new_pred[test_y == int(label)] == int(label)))}
                        for label in labels},
          'limitation': 'Random images from same source; signer/session independence and phone performance not established.'}
print(json.dumps(report, indent=2), flush=True)
(out / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
images = tf.keras.Input((224, 224, 3))
output = head(backbone(tf.keras.applications.mobilenet_v2.preprocess_input(images), training=False), training=False)
tf.keras.Model(images, output, name='experimental_digit_candidate').save(out / 'digit_candidate.keras')
print('Candidate saved locally:', out, flush=True)
